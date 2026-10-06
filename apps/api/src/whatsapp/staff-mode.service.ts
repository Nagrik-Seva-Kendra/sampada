import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AttendanceService } from "../attendance/attendance.service.js";
import { istDay, parseLeaveDecision, parseLeaveText, punchTextHi } from "../attendance/attendance-rules.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { OwnerAssistantService } from "./owner-assistant.service.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { isClose, isThanks } from "./chat-words.js";

const STATE_MS = 15 * 60 * 1000;
const IN_RE = /^(हाज़िरी|हाजिरी|हाज़री|हाजरी|haziri|hazri|haajiri|in|आ गया|आ गई|पहुँच गया|पहुंच गया|पहुँच गई|पहुंच गई|aa gaya|aa gayi|pahunch gaya|pahunch gayi)[\s!.।]*$/i;
const OUT_RE = /^(out|जा रहा हूँ|जा रहा हूं|जा रही हूँ|जा रही हूं|जा रहा|जा रही|ja raha|ja rahi|ja raha hu|ja rahi hu|निकल रहा|निकल रही|nikal raha|nikal rahi)[\s!.।]*$/i;
// One capture group only: the reason ("field work" must not add a second one -- it broke "बाहर का काम: कारण").
const FIELD_RE = /^(?:बाहर\s*का\s*काम|बाहर\s*काम|bahar\s*ka\s*ka+m|field(?:\s*work)?)\s*[:：\-–]?\s*([\s\S]*)$/i;
const ATT_WORD = /हाज़िरी|हाजिरी|हाज़री|हाजरी|haziri|hazri|haajiri|hajri|attendance|atendance|attendence|अटेंडेंस|punch|पंच/i;
const IN_WORDS = /पहुँच|पहुंच|pahunch|pahuch|आ गया|आ गई|aa gaya|aa gayi|reach|arrived/i;
const OUT_WORDS = /\bout\b|आउट|जा रहा|जा रही|ja raha|ja rahi|jaa raha|निकल|nikal|घर जा|ghar ja|chutti ho gayi|छुट्टी हो गई|leaving/i;
const MY_TASKS = /(मेरे|मेरा|mere|mera|आज|aaj|कौन\s*सा|kaun\s*sa|क्या|kya|बाकी|baki|pending|बताओ|batao|दिखाओ|dikhao|list|लिस्ट).*(काम|kaam|task)|(काम|kaam|task).*(बताओ|batao|दिखाओ|dikhao|बाकी|baki|pending|list|लिस्ट|क्या है|kya hai)/i;

/** "IN", "office pahunch gaya", "attendance laga do" → IN; "OUT", "ghar ja raha hu" → OUT; leave words → null. */
export function punchKindOf(text: string): "IN" | "OUT" | null {
  const s = text.trim();
  if (LEAVE_WORD.test(s) && !/हो गई|ho gayi/i.test(s)) return null;
  if (IN_RE.test(s)) return "IN";
  if (OUT_RE.test(s)) return "OUT";
  if (OUT_WORDS.test(s)) return "OUT";
  if (IN_WORDS.test(s) || ATT_WORD.test(s)) return "IN";
  return null;
}
const LEAVE_WORD = /छुट्टी|छुटी|अवकाश|chhutti|chutti|chhuti|leave/i;

export const STAFF_HELP =
  "नमस्ते {name}! स्टाफ के लिए:\n" +
  "• हाज़िरी: \"हाज़िरी\" लिखें, फिर लोकेशन भेजें (या ऐप में Attendance / हाज़िरी पेज)\n" +
  "• जाते समय: \"जा रहा हूँ\" लिखें, फिर लोकेशन भेजें\n" +
  "• बाहर का काम: \"बाहर का काम: कारण\" लिखें, फिर लोकेशन भेजें\n" +
  "• छुट्टी: \"छुट्टी 12/10 से 13/10 बीमारी: कारण\" या \"कल छुट्टी: कारण\"\n" +
  "• काम पूरा: \"हो गया\" या \"3 हो गया\"\n" +
  "लोकेशन सिर्फ़ हाज़िरी के समय एक बार ली जाती है।";

type StaffState =
  | { mode: "att-punch"; kind: "IN" | "OUT" | "FIELD"; reason?: string; until: string }
  | { mode: "att-field-reason"; lat: number; lng: number; until: string };

export interface StaffMessage {
  type: string;
  text?: string;
  location?: { latitude: number; longitude: number };
}

/**
 * Messages from staff numbers (Team page mobile) never reach the customer
 * flow: attendance with a location message, field work, leave applications
 * and "हो गया" for tasks. The owner decides leave with the buttons or
 * "मंज़ूर 5" / "नामंज़ूर 5". Locations and message text are never logged.
 */
@Injectable()
export class StaffModeService {
  private readonly log = new Logger("StaffMode");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly owner: OwnerAssistantService,
    private readonly outbox: WaOutboxService,
  ) {}

  /** Owner text "मंज़ूर 5" / "नामंज़ूर 5" → decision reply, else null. */
  async ownerText(phone: string, text: string): Promise<string[] | null> {
    const d = parseLeaveDecision(text);
    if (!d || !this.orgId) return null;
    return [await this.attendance.decideByNumber(this.orgId, d.n, d.approve, await this.userIdForPhone(phone))];
  }

  /** Owner pressed a मंज़ूर / नामंज़ूर button (id "leave:approve:<id>"). */
  async ownerButton(phone: string, buttonId: string): Promise<string[] | null> {
    const m = /^leave:(approve|reject):([\w-]{1,64})$/.exec(buttonId);
    if (!m || !this.orgId) return null;
    return [await this.attendance.decideById(this.orgId, m[2]!, m[1] === "approve", await this.userIdForPhone(phone))];
  }

  /** A staff member's message → replies, or null when the number is not staff. */
  async handle(phone: string, msg: StaffMessage, now = new Date()): Promise<string[] | null> {
    if (!this.orgId) return null;
    const me = await this.owner.staffForPhone(phone);
    if (!me) return null;
    const state = await this.state(phone, now);

    if (msg.type === "location" && msg.location) {
      const lat = Number(msg.location.latitude);
      const lng = Number(msg.location.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ["लोकेशन पढ़ी नहीं जा सकी, दोबारा भेजें।"];
      if (state?.mode !== "att-punch") return ['पहले लिखें: "हाज़िरी", "जा रहा हूँ" या "बाहर का काम: कारण" — फिर लोकेशन भेजें।'];
      await this.setState(phone, null);
      const r = await this.attendance.punch(this.orgId, me.userId, { kind: state.kind, lat, lng, ...(state.reason ? { reason: state.reason } : {}) }, "whatsapp", now);
      this.log.log(`staff punch ${state.kind} via whatsapp: ${r.code}`);
      if (r.code === "tooFar" && state.kind === "IN") {
        await this.setState(phone, { mode: "att-field-reason", lat, lng, until: new Date(now.getTime() + STATE_MS).toISOString() });
      }
      return [punchTextHi({ ...r, at: r.record ? new Date(r.record.at) : now })];
    }

    if (msg.type !== "text") return [STAFF_HELP.replace("{name}", me.firstName)];
    const text = (msg.text ?? "").trim();
    if (!text) return [];
    // "cancel" while a location is awaited; "ok" / "thanks": short answers, not the whole help.
    if (isClose(text)) {
      if (state) await this.setState(phone, null);
      return ["ठीक है।"];
    }
    if (isThanks(text)) return ["🙏"];

    const done = await this.owner.handleStaff(phone, text);
    if (done) return done;

    // Too far from the office for IN: this text is the field-work reason (same location).
    if (state?.mode === "att-field-reason" && !IN_RE.test(text) && !OUT_RE.test(text) && !LEAVE_WORD.test(text)) {
      await this.setState(phone, null);
      const reason = (FIELD_RE.exec(text)?.[1] || text).trim().slice(0, 500);
      const r = await this.attendance.punch(this.orgId, me.userId, { kind: "FIELD", lat: state.lat, lng: state.lng, reason }, "whatsapp", now);
      this.log.log(`staff punch FIELD via whatsapp: ${r.code}`);
      return [punchTextHi({ ...r, at: now })];
    }

    const field = FIELD_RE.exec(text);
    if (field) {
      const reason = (field[1] ?? "").trim();
      if (!reason) return ['बाहर के काम का कारण साथ लिखें — जैसे "बाहर का काम: तहसील में नामांतरण"।'];
      return this.askLocation(phone, "FIELD", reason.slice(0, 500), now);
    }
    const kind = punchKindOf(text);
    if (kind) return this.askLocation(phone, kind, undefined, now);
    // "मेरे काम", "aaj kya kaam hai": their own open tasks.
    if (MY_TASKS.test(text)) return [await this.owner.tasksTextFor(me.userId, me.firstName)];
    if (LEAVE_WORD.test(text)) {
      const leave = parseLeaveText(text, istDay(now));
      if (!leave) return ['छुट्टी की तारीख समझ नहीं आई। ऐसे लिखें: "छुट्टी 12/10 से 13/10 बीमारी: कारण" या "कल छुट्टी: कारण"।'];
      if (leave.fromDate < istDay(now)) return ["पिछली तारीख की छुट्टी यहाँ से नहीं ली जा सकती, मालिक से बात करें।"];
      const item = await this.attendance.apply(this.orgId, me.userId, { ...leave, reason: leave.reason.length >= 2 ? leave.reason : "छुट्टी" }, "whatsapp");
      return [`📝 छुट्टी की अर्ज़ी #${item.number} भेज दी गई। मालिक के जवाब की सूचना यहीं मिलेगी।`];
    }
    return [STAFF_HELP.replace("{name}", me.firstName)];
  }

  private async askLocation(phone: string, kind: "IN" | "OUT" | "FIELD", reason: string | undefined, now: Date): Promise<string[]> {
    await this.setState(phone, { mode: "att-punch", kind, ...(reason ? { reason } : {}), until: new Date(now.getTime() + STATE_MS).toISOString() });
    const body = "📍 अब अपनी अभी की लोकेशन भेजें। लोकेशन सिर्फ़ इसी हाज़िरी के लिए एक बार ली जाती है।";
    if (process.env.WA_ACCESS_TOKEN) {
      const r = await this.outbox.post(phone, {
        type: "interactive",
        interactive: { type: "location_request_message", body: { text: body }, action: { name: "send_location" } },
      });
      if (r.ok) return [];
    }
    return [`${body}\n(📎 अटैच → Location → "Send your current location")`];
  }

  private async state(phone: string, now: Date): Promise<StaffState | null> {
    const c = await this.prisma.waContact.findUnique({ where: { phone }, select: { state: true } });
    const s = (c?.state ?? null) as StaffState | null;
    if (!s || (s.mode !== "att-punch" && s.mode !== "att-field-reason")) return null;
    return Date.parse(s.until) > now.getTime() ? s : null;
  }

  private async setState(phone: string, state: StaffState | null): Promise<void> {
    await this.prisma.waContact.upsert({
      where: { phone },
      create: { phone, lastInboundAt: new Date(), state: (state ?? undefined) as any },
      update: { state: state ? (state as any) : Prisma.DbNull },
    });
  }

  private async userIdForPhone(phone: string): Promise<string | null> {
    const u = await this.prisma.user.findFirst({ where: { mobile: { endsWith: phone.slice(-10) } }, select: { id: true } });
    return u?.id ?? null;
  }
}
