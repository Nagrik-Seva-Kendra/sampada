import { randomUUID } from "node:crypto";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DEED_TASK_TYPES, TASK_WORK_LABEL_HI, type TaskWorkType, WA_TEMPLATES } from "@sampada/shared";
import { AttendanceService } from "../attendance/attendance.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SpeechService } from "../tasks/speech.service.js";
import { TaskExtractorService } from "../tasks/task-extractor.service.js";
import {
  confirmText,
  digestText,
  formatDueHi,
  hasTaskInstruction,
  isAttendanceQuestion,
  isQuestion,
  isSmallTalk,
  looksLikeTask,
  OWNER_HELP,
  parseOwnerCommand,
  parseStaffDone,
  QUESTION_HELP,
  TASK_OR_QUESTION,
  type TaskDraft,
} from "../tasks/task-rules.js";
import { normalizePhone, TasksService } from "../tasks/tasks.service.js";
import { alertNumbers } from "./wa-alerts.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { maskPhone } from "./webhook-diagnostics.js";

const YES = /^(हाँ|हां|हा|ha|haan|han|yes|y|ok|ठीक है|ठीक|theek|thik|sahi|सही)[\s!.।]*$/i;
const NO = /^(नहीं|नही|ना|no|nope|n|nahi|nahin|nhi|na|mat|मत|नहीं चाहिए|nahi chahiye|mat karo|मत करो)[\s!.।]*$/i;
const CHANGE = /^(बदलें|बदलो|बदल|badlen|badlo|badal|change|edit)[\s!.।]*$/i;
const CANCEL = /^(रद्द|रद्द करो|रद्द करें|radd|radd karo|cancel|cancel it|cancel karo|cancelled|रहने दो|rehne do|छोड़ो|छोड़ दो|chhodo|chodo|chhod do|stop)[\s!.।]*$/i;
export const CUSTOMER_TEST_MS = 30 * 60 * 1000;
export const AUDIO_KEEP_MS = 7 * 24 * 3600 * 1000;

type OwnerState =
  | { mode: "task-confirm"; draft: TaskDraft; transcript: string; source: "voice" | "text" }
  | { mode: "task-outreach"; taskId: string }
  | { mode: "task-or-question"; text: string; source: "voice" | "text" }
  | null;

/** WA_OWNER_NUMBERS (default WA_ALERT_NUMBERS): messages from these are the owner's, not a customer's. */
export function ownerNumbers(): string[] {
  return alertNumbers(process.env.WA_OWNER_NUMBERS || process.env.WA_ALERT_NUMBERS);
}

export interface OwnerMessage {
  type: "text" | "audio";
  text?: string;
  audio?: { key: string; buf: Buffer; mime: string };
}

/**
 * The owner's WhatsApp assistant: a voice note or text becomes a to-do item
 * after "हाँ"; "3 हो गया" / "3 कल" / "काम" / "सब स्टाफ को: ..." are commands;
 * "ग्राहक मोड" lets the owner test the customer flow for 30 minutes. Staff
 * reply "हो गया" from their own numbers. Logs carry task numbers and masked
 * numbers only -- never what was said.
 */
@Injectable()
export class OwnerAssistantService {
  private readonly log = new Logger("OwnerAssistant");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly speech: SpeechService,
    private readonly extractor: TaskExtractorService,
    private readonly outbox: WaOutboxService,
    @Optional() private readonly attendance?: AttendanceService,
  ) {}

  isOwner(phone: string): boolean {
    return ownerNumbers().includes(phone);
  }

  /** Owner in "ग्राहक मोड" (testing the customer flow)? */
  async inCustomerTest(phone: string, now = new Date()): Promise<boolean> {
    const c = await this.prisma.waContact.findUnique({ where: { phone } });
    return !!c?.ownerTestUntil && c.ownerTestUntil > now;
  }

  async endCustomerTest(phone: string): Promise<string[]> {
    await this.prisma.waContact.updateMany({ where: { phone }, data: { ownerTestUntil: null, state: Prisma.DbNull } });
    return ["✅ ओनर मोड चालू। अब आपके संदेश काम (टास्क) के रूप में लिए जाएँगे।"];
  }

  // ---------- owner ----------
  async handle(phone: string, msg: OwnerMessage, now = new Date()): Promise<string[]> {
    let text = msg.text ?? "";
    let source: "voice" | "text" = "text";
    if (msg.type === "audio" && msg.audio) {
      // The recording is kept 7 days (for checking the transcript), then deleted.
      await this.prisma.waMediaDeletion
        .upsert({ where: { key: msg.audio.key }, create: { key: msg.audio.key, deleteAt: new Date(now.getTime() + AUDIO_KEEP_MS) }, update: {} })
        .catch(() => undefined);
      const r = await this.speech.transcribe(msg.audio.buf, msg.audio.mime);
      if (!r.ok) {
        this.log.log(`owner voice note: not transcribed (${r.reason})`);
        if (r.reason === "disabled" || r.reason === "no-key") return ["🎙️ Voice अभी बंद है, कृपया लिख कर भेजें।"];
        if (r.reason === "too-long") return ["🎙️ Voice बहुत लंबा है। कृपया 1 मिनट से छोटा भेजें, या लिख कर भेजें।"];
        return ["🎙️ Voice समझ नहीं आया। कृपया दोबारा बोलें या लिख कर भेजें।"];
      }
      text = r.text;
      source = "voice";
    }
    text = text.trim();
    if (!text) return [];

    const c = await this.prisma.waContact.findUnique({ where: { phone } });
    let state = (c?.state as OwnerState) ?? null;

    // "हाज़िरी किसने नहीं लगाई": today's attendance, never a task (a waiting task stays waiting).
    if (isAttendanceQuestion(text) && this.attendance && this.orgId) {
      this.log.log(`owner question: attendance (${source})`);
      const report = await this.attendance.todayReport(this.orgId, now);
      return state?.mode === "task-confirm" ? [report, 'पिछला काम अभी पुष्टि के लिए बाकी है: "हाँ" / "बदलें" / "रद्द"'] : [report];
    }
    if (state?.mode === "task-or-question") {
      if (/^\s*(1|हाँ|हां|haan|han|yes|काम|kaam)\s*[.।]?\s*$/i.test(text)) return this.propose(phone, state.text, state.source, now);
      await this.setState(phone, null);
      if (/^\s*(2|सवाल|sawal|swal|नहीं|nahi|no)\s*[.।]?\s*$/i.test(text)) return [QUESTION_HELP];
      state = null; // something new: handled as a fresh message
    }

    if (state?.mode === "task-confirm") {
      if (YES.test(text)) return this.save(phone, state, now);
      if (CANCEL.test(text) || NO.test(text)) {
        await this.setState(phone, null);
        return ["ठीक है, यह काम दर्ज नहीं किया।"];
      }
      if (CHANGE.test(text)) return ["क्या बदलना है? सही बात लिखें या बोलें (जैसे: तारीख सोमवार, नाम रमेश शर्मा)।"];
      // A greeting is its own message, not a correction: answer it and remind what is waiting.
      if (isSmallTalk(text)) return [OWNER_HELP, 'पिछला काम अभी पुष्टि के लिए बाकी है: "हाँ" / "बदलें" / "रद्द"'];
      // Anything else is a correction of the same task.
      if (!parseOwnerCommand(text, now)) return this.propose(phone, `${state.transcript}\nसुधार: ${text}`, state.source, now);
    }
    if (state?.mode === "task-outreach") {
      if (YES.test(text)) return this.outreach(phone, state.taskId);
      if (NO.test(text) || CANCEL.test(text)) {
        await this.setState(phone, null);
        return ["ठीक है, पार्टी को संदेश नहीं भेजा।"];
      }
    }

    const cmd = parseOwnerCommand(text, now);
    if (cmd) {
      this.log.log(`owner command ${cmd.kind}`);
      switch (cmd.kind) {
        case "customerMode":
          await this.prisma.waContact.upsert({
            where: { phone },
            create: { phone, lastInboundAt: now, ownerTestUntil: new Date(now.getTime() + CUSTOMER_TEST_MS), state: undefined },
            update: { ownerTestUntil: new Date(now.getTime() + CUSTOMER_TEST_MS), state: Prisma.DbNull },
          });
          return ['🧪 ग्राहक मोड 30 मिनट के लिए चालू। अब आप ग्राहक की तरह बॉट आज़मा सकते हैं। वापस आने के लिए "ओनर मोड" लिखें।'];
        case "ownerMode":
          return this.endCustomerTest(phone);
        case "list":
          return [await this.listText(now)];
        case "broadcast":
          return [await this.broadcast(phone, cmd.message)];
        case "done":
        case "cancel":
        case "due": {
          const t = await this.tasks.findByNumber(this.orgId, cmd.n);
          if (!t) return [`काम #${cmd.n} नहीं मिला। सूची के लिए "काम" लिखें।`];
          if (cmd.kind === "done") {
            await this.tasks.setStatus(t.id, "DONE");
            return [`✅ काम #${t.number} पूरा: ${t.title}`];
          }
          if (cmd.kind === "cancel") {
            await this.tasks.setStatus(t.id, "CANCELLED");
            return [`काम #${t.number} रद्द किया: ${t.title}`];
          }
          await this.tasks.setDue(t.id, cmd.due);
          return [`📅 काम #${t.number} की नई तारीख: ${formatDueHi(cmd.due.toISOString())}`];
        }
      }
    }
    // A lone "हाँ/नहीं/रद्द" with nothing waiting for it is not a new task.
    if (NO.test(text) || CANCEL.test(text) || CHANGE.test(text) || (YES.test(text) && !isSmallTalk(text))) {
      return ['अभी कोई काम पुष्टि के लिए नहीं है। नया काम लिखें या बोलें, या सूची के लिए "काम" लिखें।'];
    }
    // Greetings, "ok", "thanks", a word or two without any work in it: a short help, no task prompt.
    if (!looksLikeTask(text, now)) {
      this.log.log(`owner message: not a task (${source})`);
      return source === "voice" ? [`🎙️ सुना: "${text.slice(0, 200)}"`, OWNER_HELP] : [OWNER_HELP];
    }
    // A question ("किसका ... बाकी है?") without anything to do in it: ask, don't guess.
    if (isQuestion(text) && !hasTaskInstruction(text, now)) {
      this.log.log(`owner message: question or task? (${source})`);
      await this.setState(phone, { mode: "task-or-question", text: text.slice(0, 4000), source });
      return [TASK_OR_QUESTION];
    }
    return this.propose(phone, text, source, now);
  }

  /** Read the note into a task and ask "ठीक?". */
  private async propose(phone: string, transcript: string, source: "voice" | "text", now: Date): Promise<string[]> {
    const draft = await this.extractor.extract(transcript, now);
    if (!draft) return ["माफ़ कीजिए, काम समझ नहीं आया। कृपया पार्टी, काम और तारीख के साथ दोबारा लिखें या बोलें।"];
    await this.setState(phone, { mode: "task-confirm", draft, transcript: transcript.slice(0, 4000), source });
    const heard = source === "voice" ? [`🎙️ सुना: "${transcript.slice(0, 500)}"`] : [];
    return [...heard, confirmText(draft)];
  }

  private async save(phone: string, state: Extract<OwnerState, { mode: "task-confirm" }>, now: Date): Promise<string[]> {
    const d = state.draft;
    const createdById = await this.userIdForPhone(phone);
    const row = await this.tasks.create(this.orgId, {
      title: d.title,
      partyName: d.partyName,
      partyPhone: d.partyPhone,
      workType: d.workType,
      place: d.place,
      dueAt: d.dueAt ? new Date(d.dueAt) : null,
      note: d.note,
      source: state.source,
      transcript: state.transcript,
      createdById,
    });
    const out = [`✅ काम #${row.number} दर्ज हो गया। पूरा होने पर "${row.number} हो गया" लिखें।`];
    // Papers can be asked for on WhatsApp straight away -- only after the owner says हाँ.
    if (DEED_TASK_TYPES.includes(d.workType) && d.partyPhone) {
      await this.setState(phone, { mode: "task-outreach", taskId: row.id });
      out.push(`पार्टी (${maskPhone(d.partyPhone)}) को WhatsApp पर कागज़ माँगना शुरू करूँ? "हाँ" / "नहीं"`);
    } else {
      await this.setState(phone, null);
    }
    void now;
    return out;
  }

  /** Owner said हाँ: the party gets the first message of the draft flow; the request links to the task when they send papers. */
  private async outreach(phone: string, taskId: string): Promise<string[]> {
    await this.setState(phone, null);
    const t = await this.prisma.task.findFirst({ where: { id: taskId, organizationId: this.orgId } });
    if (!t?.partyPhone) return ["पार्टी का मोबाइल नहीं मिला।"];
    const name = t.partyName ? `${t.partyName} जी` : "जी";
    const work = TASK_WORK_LABEL_HI[(t.workType as TaskWorkType) ?? "other"] ?? "दस्तावेज़";
    const papers = t.workType === "mortgage" ? "बैंक का सैंक्शन लेटर और संपत्ति की रजिस्ट्री" : "संपत्ति की पुरानी रजिस्ट्री";
    const text = `नमस्ते ${name}, नागरिक सेवा केंद्र से संदेश: आपके ${work} के ड्राफ्ट के लिए कृपया इस नंबर पर ${papers} की PDF या सभी पन्नों की साफ़ फ़ोटो भेजें। धन्यवाद।`;
    const d = await this.outbox.deliverDirect(t.partyPhone, text, {
      name: WA_TEMPLATES.partyPapers.name,
      language: WA_TEMPLATES.partyPapers.language,
      params: [name, work],
    });
    await this.prisma.task.update({ where: { id: t.id }, data: { outreachAt: new Date() } });
    this.log.log(`task #${t.number}: papers requested from ${maskPhone(t.partyPhone)} (${d.status})`);
    return d.status === "SENT"
      ? [`📨 पार्टी को संदेश भेज दिया (काम #${t.number})। कागज़ आते ही अनुरोध इस काम से जुड़ जाएगा।`]
      : [`⚠️ पार्टी को संदेश नहीं जा सका (${d.reason ?? "कारण नहीं पता"})। WhatsApp टेम्पलेट स्वीकृत होने के बाद दोबारा कोशिश करें।`];
  }

  /** "सब स्टाफ को: ..." → one task per staff member with a mobile, and a WhatsApp to each. */
  private async broadcast(ownerPhone: string, message: string): Promise<string> {
    const staff = await this.staff();
    const broadcastId = randomUUID();
    const createdById = await this.userIdForPhone(ownerPhone);
    const sent: string[] = [];
    const noPhone: string[] = [];
    for (const s of staff) {
      if (!s.phone) {
        noPhone.push(s.name);
        continue;
      }
      await this.tasks.create(this.orgId, { title: message.slice(0, 200), note: message, source: "broadcast", assigneeId: s.userId, createdById, broadcastId });
      await this.outbox.deliverDirect(s.phone, `नमस्ते ${s.firstName}, ऑफिस से नया काम:\n${message}\nपूरा होने पर "हो गया" लिखें।`, {
        name: WA_TEMPLATES.staffTask.name,
        language: WA_TEMPLATES.staffTask.language,
        params: [s.firstName, message.replace(/\s+/g, " ").slice(0, 200)],
      });
      sent.push(s.name);
    }
    this.log.log(`broadcast to ${sent.length} staff (${noPhone.length} without mobile)`);
    return [
      `📣 ${sent.length} स्टाफ को भेजा: ${sent.join(", ") || "—"}`,
      ...(noPhone.length ? [`मोबाइल नहीं (Team पेज पर भरें): ${noPhone.join(", ")}`] : []),
      'जो "हो गया" लिखेंगे, उनकी सूची आपको भेजी जाएगी।',
    ].join("\n");
  }

  private async listText(now: Date): Promise<string> {
    const open = await this.tasks.openTasks(this.orgId);
    if (!open.length) return "कोई खुला काम नहीं है। ✅";
    const names = await this.tasks.userNames(open.map((t) => t.assigneeId));
    const digest = digestText(
      open.map((t) => ({ number: t.number, title: t.title, dueAt: t.dueAt, assigneeName: t.assigneeId ? names.get(t.assigneeId) : null })),
      now,
    );
    const later = open.filter((t) => !t.dueAt || t.dueAt >= new Date(now.getTime() + 0)).filter((t) => !digest.includes(`${t.number}. `));
    const rest = later.slice(0, 15).map((t) => `${t.number}. ${t.title} — ${formatDueHi(t.dueAt?.toISOString() ?? null)}`);
    return [digest || "आज और पुराने बाकी काम नहीं हैं।", ...(rest.length ? ["", "आगे के काम:", ...rest] : [])].join("\n");
  }

  // ---------- staff ----------
  /** Active staff (not OWNER) of the org, with their WhatsApp number from the Team page mobile. */
  async staff(): Promise<{ userId: string; name: string; firstName: string; phone: string | null }[]> {
    const members = await this.prisma.membership.findMany({
      where: { organizationId: this.orgId, status: "ACTIVE", role: { not: "OWNER" } },
      select: { user: { select: { id: true, fname: true, lname: true, mobile: true } } },
    });
    return members.map((m) => ({
      userId: m.user.id,
      name: `${m.user.fname} ${m.user.lname}`.trim(),
      firstName: m.user.fname,
      phone: normalizePhone(m.user.mobile),
    }));
  }

  /** The staff member writing from this number, or null. */
  async staffForPhone(phone: string) {
    if (this.isOwner(phone)) return null;
    return (await this.staff()).find((s) => s.phone === phone) ?? null;
  }

  /** A staff member's "हो गया": marks their task done and tells the owner (with who is still pending). */
  async handleStaff(phone: string, text: string): Promise<string[] | null> {
    const me = await this.staffForPhone(phone);
    if (!me) return null;
    const done = parseStaffDone(text);
    if (!done) return null;
    const t = done.n
      ? await this.prisma.task.findFirst({ where: { organizationId: this.orgId, number: done.n, assigneeId: me.userId, status: "OPEN" } })
      : await this.prisma.task.findFirst({ where: { organizationId: this.orgId, assigneeId: me.userId, status: "OPEN" }, orderBy: { createdAt: "desc" } });
    if (!t) return ["आपका कोई खुला काम नहीं मिला।"];
    await this.tasks.setStatus(t.id, "DONE");
    let note = `✅ ${me.name} ने काम #${t.number} पूरा किया: ${t.title}`;
    if (t.broadcastId) {
      const pending = await this.prisma.task.findMany({ where: { broadcastId: t.broadcastId, status: "OPEN" }, select: { assigneeId: true } });
      const names = await this.tasks.userNames(pending.map((p) => p.assigneeId));
      note += pending.length ? `\nबाकी: ${[...names.values()].join(", ")}` : "\nसभी ने पूरा कर लिया ✅";
    }
    for (const o of ownerNumbers()) await this.outbox.deliverDirect(o, note, null);
    this.log.log(`task #${t.number} done by staff`);
    return [`✅ धन्यवाद! काम #${t.number} पूरा दर्ज हुआ।`];
  }

  /** Papers arrived from a party the owner asked: link the new request to that task. */
  async linkRequest(phone: string, requestId: string): Promise<void> {
    await this.prisma.task.updateMany({
      where: { organizationId: this.orgId, partyPhone: phone, status: "OPEN", outreachAt: { not: null }, linkedRequestId: null },
      data: { linkedRequestId: requestId },
    });
  }

  private async userIdForPhone(phone: string): Promise<string | null> {
    const ten = phone.slice(-10);
    const u = await this.prisma.user.findFirst({ where: { mobile: { endsWith: ten } }, select: { id: true } });
    return u?.id ?? null;
  }

  private async setState(phone: string, state: OwnerState): Promise<void> {
    await this.prisma.waContact.upsert({
      where: { phone },
      create: { phone, lastInboundAt: new Date(), state: (state ?? undefined) as any },
      update: { state: state ? (state as any) : Prisma.DbNull },
    });
  }
}
