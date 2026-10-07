import { SpeechService } from "../tasks/speech.service.js";
import { deleteMedia } from "./wa-media.js";
import { MENU_NUDGE } from "./chat-words.js";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { PrismaService } from "../prisma/prisma.service.js";
import { r2Configured, r2Put } from "../guideline/r2.js";
import { DraftIntakeService, type IncomingFile } from "./draft-intake.service.js";
import { Debouncer, type DebouncedBatch } from "./debouncer.js";
import { DraftReviewService } from "./draft-review.service.js";
import { FrontDoorService } from "./front-door.service.js";
import { OwnerAssistantService } from "./owner-assistant.service.js";
import { StaffModeService } from "./staff-mode.service.js";
import { ColonyService } from "../colony/colony.service.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import {
  checkSignature,
  graphBase as graph,
  graphErrorSummary,
  isUniqueViolation,
  maskPhone,
  metaErrorOf,
  recordOutbound,
  type SignatureResult,
} from "./webhook-diagnostics.js";

/** A voice note that could not be understood: never "please type" -- many customers cannot. */
/** "सब भेज दिया", "डीड बना दो", "हो गया": the sender is done sending pages. */
const FINISH_WORDS = /(डीड|डिड|deed|did)\s*(बना|bana|banao|बनाओ|बनादो)|बना\s*दो|bana\s*do|banado|सब\s*भेज|sab\s*bhej|भेज\s*दिया|bhej\s*diya|bhej\s*diye|^(हो\s*गया|ho\s*gaya|done|बस|bas)[\s!.।]*$/i;

export const VOICE_NOT_HEARD = "🎙️ आपकी आवाज़ साफ़ समझ नहीं आई। कृपया दोबारा धीरे बोलकर भेजें, या 4 लिखें — हमारा स्टाफ आपसे बात करेगा। कार्यालय फ़ोन: 78984 75648";

@Injectable()
export class WhatsappService {
  private readonly log = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: DraftIntakeService,
    private readonly outbox: WaOutboxService,
    private readonly drafts: DraftReviewService,
    private readonly front: FrontDoorService,
    private readonly owner: OwnerAssistantService,
    private readonly staffMode: StaffModeService,
    @Optional() private readonly colony?: ColonyService,
    @Optional() private readonly speech?: SpeechService,
  ) {}

  /** Texts from one number within WA_DEBOUNCE_MS (default 10 s) are handled together. */
  private debounceMs(): number {
    const n = Number(process.env.WA_DEBOUNCE_MS ?? 10_000);
    return Number.isFinite(n) ? n : 10_000;
  }
  private readonly debouncer = new Debouncer(() => this.debounceMs());

  private async handleTextsSafely(from: string, batch: DebouncedBatch): Promise<void> {
    try {
      await this.handleTexts(from, batch);
    } catch (e: any) {
      this.log.error(`text batch from ${maskPhone(from)} failed: ${e?.message}`);
      await this.sendText(from, "क्षमा करें, तकनीकी समस्या आई। हमारा स्टाफ आपसे संपर्क करेगा।");
    }
  }

  // ---------- security ----------
  verifySignature(rawBody: Buffer | undefined, header: string | undefined): SignatureResult {
    return checkSignature(process.env.WA_APP_SECRET, rawBody, header);
  }

  // ---------- incoming ----------
  /** Per-number queue (this process): the next message of a number starts after the previous one is answered. */
  private readonly lanes = new Map<string, Promise<void>>();
  private inLane(key: string, fn: () => Promise<void>): Promise<void> {
    const run = (this.lanes.get(key) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => undefined);
    this.lanes.set(key, tail);
    void tail.then(() => {
      if (this.lanes.get(key) === tail) this.lanes.delete(key);
    });
    return run;
  }

  async handlePayload(body: any): Promise<void> {
    if (body?.object !== "whatsapp_business_account") return;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const contact = value?.contacts?.[0];
        for (const msg of value?.messages ?? []) {
          // One number's messages run one after another, each to its own reply: Meta sends every
          // message as its own webhook, and without this a quick "रद्द" + "Hello" both read the
          // old "ठीक?" state and the replies come out shifted by one.
          await this.inLane(String(msg.from ?? ""), async () => {
            if (!(await this.firstTime(msg.id))) return; // Meta retries → ignore duplicates
            try {
              await this.handleMessage(msg, msg.from, contact?.profile?.name ?? "");
            } catch (e: any) {
              this.log.error(`message ${msg.id} failed: ${e?.message}`);
              await this.sendText(msg.from, "क्षमा करें, तकनीकी समस्या आई। हमारा स्टाफ आपसे संपर्क करेगा।");
            }
          });
        }
      }
    }
  }

  /**
   * Records the WhatsApp message id; false only if it was already processed
   * (unique violation). Any other DB error is logged and the message is still
   * handled -- a customer getting a rare duplicate reply beats silently
   * dropping every message while the table is missing or the DB is down.
   */
  async firstTime(waMessageId: string): Promise<boolean> {
    try {
      await this.prisma.waInboundMessage.create({ data: { waMessageId } });
      return true;
    } catch (e: any) {
      if (isUniqueViolation(e)) {
        this.log.log(`message ${waMessageId} already processed, skipping duplicate delivery`);
        return false;
      }
      this.log.error(`idempotency check failed for ${waMessageId} (${e?.code ?? e?.name ?? "error"}); processing anyway`);
      return true;
    }
  }

  private async handleMessage(msg: any, from: string, name: string): Promise<void> {
    await this.markRead(msg.id);
    // Opens the 24h window in which the office may send free-form text (status updates ...).
    await this.outbox.touchContact(from).catch((e) => this.log.warn(`window update failed: ${e?.code ?? e?.name ?? "error"}`));
    // The owner's numbers: a to-do assistant, unless testing the customer flow ("ग्राहक मोड").
    if (this.owner.isOwner(from)) {
      const body = msg.type === "text" ? String(msg.text?.body ?? "") : "";
      // Leave decisions: the मंज़ूर / नामंज़ूर buttons or "मंज़ूर 5".
      const buttonId = msg.type === "interactive" ? String(msg.interactive?.button_reply?.id ?? "") : "";
      const decision = buttonId ? await this.staffMode.ownerButton(from, buttonId) : body ? await this.staffMode.ownerText(from, body) : null;
      if (decision) {
        await this.send(from, decision);
        this.log.log(`message ${msg.id} from owner route=leave-decision`);
        return;
      }
      const testing = await this.owner.inCustomerTest(from);
      const companyMode = !!this.colony?.inOwnerCompanyMode(from);
      if ((testing || companyMode) && /^(ओनर|owner|मालिक|malik)\s*(मोड|mode)$/i.test(body.trim())) {
        this.colony?.endOwnerCompanyMode(from);
        await this.send(from, await this.owner.endCustomerTest(from));
        return;
      }
      // "कंपनी मोड" -- only when the owner says it (never by itself): the owner sends a colony sale paper the
      // way the company would. Papers make deeds only from here and from the projects' company numbers.
      if (this.colony && /^(कंपनी|कम्पनी|company|kampani|kmpni)\s*(मोड|mode|मॉड)$/i.test(body.trim())) {
        await this.send(from, this.colony.startOwnerCompanyMode(from));
        this.log.log(`message ${msg.id} from owner route=company-mode-on`);
        return;
      }
      if (companyMode && this.colony) {
        if (msg.type === "document" || msg.type === "image") {
          await this.queuePaper(from, msg);
          return;
        }
        if (msg.type === "text") {
          // In कंपनी मोड a text is never a task: "डीड बना दो" reads / finishes the paper, else the company help.
          const replies = (await this.companyText(from, body)) ?? ['🏢 कंपनी मोड चालू है। बिक्री का कागज़ (फ़ोटो / PDF) भेजें, या "ओनर मोड" लिखें।'];
          await this.send(from, replies);
          this.log.log(`message ${msg.id} from owner route=company replies=${replies.length}`);
          return;
        }
      }
      // A PDF / photo from the owner belongs to a task, never to the customer draft flow.
      if (!testing && (msg.type === "document" || msg.type === "image")) {
        const media = msg[msg.type]; // { id, mime_type, filename?, caption? }
        const file = await this.downloadMedia(media.id, media.filename);
        const replies = await this.owner.handleFile(from, { ...file, fileName: media.filename ?? null }, String(media.caption ?? ""));
        await this.send(from, replies);
        this.log.log(`message ${msg.id} from owner type=${msg.type} route=owner-file replies=${replies.length}`);
        return;
      }
      if (!testing && (msg.type === "text" || msg.type === "audio")) {
        const audio = msg.type === "audio" ? await this.downloadMedia(msg.audio.id) : undefined;
        const replies = await this.owner.handle(from, { type: msg.type, text: body, audio });
        await this.send(from, replies);
        this.log.log(`message ${msg.id} from owner type=${msg.type} route=owner replies=${replies.length}`);
        return;
      }
    }
    // Staff numbers (Team page mobile) never reach the customer flow: attendance, leave, "हो गया".
    const staffReply = await this.staffMode.handle(from, {
      type: msg.type,
      text: msg.type === "text" ? String(msg.text?.body ?? "") : undefined,
      location: msg.type === "location" ? msg.location : undefined,
    });
    if (staffReply) {
      await this.send(from, staffReply);
      this.log.log(`message ${msg.id} from staff ${maskPhone(from)} type=${msg.type} route=staff replies=${staffReply.length}`);
      return;
    }
    // A colony company's sale paper (photo / PDF): read it, enter the sale, make the deed.
    if ((msg.type === "document" || msg.type === "image") && this.colony && (await this.colony.isCompanyNumber(from))) {
      await this.queuePaper(from, msg);
      return;
    }
    // A colony project's company people (company mode): plot status, counts, sale drafts.
    if (msg.type === "text" && this.colony) {
      const company = await this.companyText(from, String(msg.text?.body ?? ""));
      if (company) {
        await this.send(from, company);
        this.log.log(`message ${msg.id} from ${maskPhone(from)} route=company replies=${company.length}`);
        return;
      }
    }
    if (!(await this.front.allowInbound(from))) {
      this.log.log(`message ${msg.id} from ${maskPhone(from)} type=${msg.type} route=blocked`);
      return;
    }
    const ctx = { phone: from, name };

    // Call buttons (menu 5): "मैं अभी कॉल करूँगा" / "मुझे कॉल बैक करें".
    if (msg.type === "interactive") {
      const id = String(msg.interactive?.button_reply?.id ?? "");
      const replies = id ? await this.front.callButton(from, id) : null;
      if (replies) {
        await this.send(from, replies);
        this.log.log(`message ${msg.id} from ${maskPhone(from)} type=interactive route=call replies=${replies.length}`);
        return;
      }
    }

    switch (msg.type) {
      case "text": {
        // Several quick texts → one batch, one answer. Not awaited (except with no window),
        // so the next message of the same webhook delivery joins this batch.
        const done = this.debouncer.push(from, msg.text?.body ?? "", name, (b) => this.handleTextsSafely(from, b));
        if (this.debounceMs() <= 0) await done;
        else done.catch(() => undefined);
        return;
      }
      case "document":
      case "image": {
        await this.debouncer.flushNow(from); // texts sent just before the file come first
        const media = msg[msg.type]; // { id, mime_type, filename?, caption? }
        const file = await this.downloadMedia(media.id, media.filename);
        const viaCost = (await this.intake.hasActive(from)) ? null : await this.front.handleDocument(from, file);
        const replies = viaCost ? viaCost.replies : await this.intake.handleDocument(ctx, file);
        if (!viaCost) await this.linkTask(from);
        await this.send(from, replies);
        await this.afterReply(from);
        this.log.log(`message ${msg.id} from ${maskPhone(from)} type=${msg.type} route=${viaCost ? "cost" : "flow"} replies=${replies.length}`);
        return;
      }
      case "audio": {
        // A customer who cannot type speaks: the voice note becomes text and goes the same way as typed text.
        const heard = await this.customerVoice(msg.audio?.id).catch(() => null);
        if (heard) {
          const done = this.debouncer.push(from, heard, name, (b) => this.handleTextsSafely(from, b));
          if (this.debounceMs() <= 0) await done;
          else done.catch(() => undefined);
          this.log.log(`message ${msg.id} from ${maskPhone(from)} type=audio route=voice-as-text`);
          return;
        }
        await this.send(from, await this.front.withoutRepeats(from, [VOICE_NOT_HEARD]));
        this.log.log(`message ${msg.id} from ${maskPhone(from)} type=audio route=voice-not-heard`);
        return;
      }
      default: {
        // "unsupported": WhatsApp did not pass the message on (e.g. an HD / view-once photo).
        const ask = msg.type === "unsupported" ? "यह संदेश खुल नहीं पाया। फ़ोटो सामान्य (HD नहीं) भेजें, या PDF भेजें।" : "कृपया टेक्स्ट संदेश, फ़ोटो या PDF भेजें।";
        const replies = await this.front.withoutRepeats(from, [ask]);
        await this.send(from, replies);
        this.log.log(`message ${msg.id} from ${maskPhone(from)} type=${msg.type} route=unsupported replies=${replies.length}${replies.length ? "" : " silent=repeat-suppressed"}`);
      }
    }
  }

  // ---------- colony sale papers ----------
  /** Pages of a sale paper sent one after another (details, payment, map) are read together. */
  private readonly papers = new Map<string, { files: IncomingFile[]; caption: string; timer?: NodeJS.Timeout }>();
  private paperWaitMs(): number {
    const n = Number(process.env.WA_PAPER_WAIT_MS ?? 15_000);
    return Number.isFinite(n) && n >= 0 ? n : 15_000;
  }

  /**
   * A company number's (or the owner's in कंपनी मोड) text: "सब भेज दिया" / "डीड बना दो" reads the
   * waiting pages now, or finishes the last paper's sale; anything else is company mode (plot, status).
   */
  private async companyText(from: string, body: string): Promise<string[] | null> {
    if (!this.colony) return null;
    if (FINISH_WORDS.test(body.trim())) {
      const waiting = this.papers.get(from);
      if (waiting?.files.length) {
        clearTimeout(waiting.timer);
        await this.readPaper(from);
        return [];
      }
      const r = await this.colony.companyFinish(from);
      if (r) {
        if (r.ownerAlert) await this.outbox.alertOwners(r.ownerAlert).catch(() => undefined);
        return r.replies;
      }
    }
    return this.colony.handleCompany(from, body);
  }

  private async queuePaper(from: string, msg: any): Promise<void> {
    const media = msg[msg.type]; // { id, mime_type, filename?, caption? }
    const file = await this.downloadMedia(media.id, media.filename);
    const wait = this.paperWaitMs();
    const cur = this.papers.get(from) ?? { files: [], caption: "" };
    cur.files.push(file);
    if (media.caption) cur.caption = `${cur.caption} ${String(media.caption)}`.trim();
    this.papers.set(from, cur);
    this.log.log(`message ${msg.id} from ${maskPhone(from)} type=${msg.type} route=company-paper page=${cur.files.length}`);
    if (wait <= 0) return this.readPaper(from);
    if (cur.files.length === 1) await this.send(from, ["📄 कागज़ मिला — पढ़ रहा हूँ। बाकी पन्ने (भुगतान, नक्शा) हों तो अभी भेज दें।"]);
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => void this.readPaper(from).catch((e) => this.log.error(`company paper failed: ${e?.name ?? "error"}`)), wait);
    cur.timer.unref?.();
  }

  private async readPaper(from: string): Promise<void> {
    const cur = this.papers.get(from);
    this.papers.delete(from);
    if (!cur?.files.length || !this.colony) return;
    try {
      const r = await this.colony.handleCompanyFile(from, cur.files.map((f) => ({ buf: f.buf, mime: f.mime })), cur.caption);
      if (r) {
        await this.send(from, r.replies);
        if (r.ownerAlert) await this.outbox.alertOwners(r.ownerAlert).catch(() => undefined);
        this.log.log(`company paper from ${maskPhone(from)} pages=${cur.files.length} replies=${r.replies.length}`);
      }
    } finally {
      // The paper carries Aadhaar / PAN: what was needed is in the sale (encrypted); the files are not kept.
      for (const f of cur.files) await deleteMedia(f.key).catch(() => this.log.warn("company paper not deleted"));
    }
  }

  /** One debounced batch of texts from a number: draft review → draft flow → front door (menu ...). */
  async handleTexts(from: string, batch: DebouncedBatch): Promise<void> {
    const text = batch.texts.map((t) => t.trim()).filter(Boolean).join("\n");
    const ctx = { phone: from, name: batch.name };
    let route: string;
    let replies: string[];
    let silent = "no-reply"; // why nothing was sent, for the log
    if (await this.front.isBlocked(from)) {
      // Blocked while these texts were waiting (spam burst): stay silent.
      route = "blocked";
      replies = [];
    } else if (await this.front.checkAbuse(from, text)) {
      route = "abuse";
      replies = [];
    } else {
      const review = await this.drafts.handleReply(from, text);
      if (review) {
        route = "draft-review";
        replies = review;
      } else if (await this.intake.hasActive(from)) {
        await this.front.clearGibberish(from);
        route = "flow";
        replies = (await this.intake.handleText(ctx, text)) ?? [];
      } else {
        const r = await this.front.handle(from, text, () => this.intake.handleText(ctx, text));
        route = r.route;
        // Generic answers are never repeated within 10 minutes; answers to the customer's own question always go.
        replies = r.force ? r.replies : await this.front.withoutRepeats(from, r.replies);
        if (r.replies.length && !replies.length) {
          silent = "repeat-suppressed";
          // The menu again within 10 minutes: one short nudge instead of silence.
          if (r.route === "menu" || r.route === "greeting" || r.route === "gibberish") replies = await this.front.withoutRepeats(from, [MENU_NUDGE]);
        }
      }
    }
    await this.send(from, replies);
    if (route !== "abuse" && route !== "blocked") await this.afterReply(from);
    this.log.log(`text batch from ${maskPhone(from)} messages=${batch.texts.length} route=${route} replies=${replies.length}${replies.length ? "" : ` silent=${silent}`}`);
  }

  /** Papers from a party the owner asked for (task outreach): link the request to that task. */
  private async linkTask(from: string): Promise<void> {
    const req = await this.prisma.draftIntake
      .findFirst({ where: { phone: from, ...(process.env.WA_DEFAULT_ORG_ID ? { organizationId: process.env.WA_DEFAULT_ORG_ID } : {}) }, orderBy: { createdAt: "desc" }, select: { id: true } })
      .catch(() => null);
    if (req) await this.owner.linkRequest(from, req.id).catch(() => undefined);
  }

  private async send(to: string, replies: string[]): Promise<void> {
    for (const r of replies.filter(Boolean)) await this.sendText(to, r);
  }

  /** The window is open now: a draft PDF that could not go out earlier is sent after this reply. */
  private async afterReply(from: string): Promise<void> {
    await this.drafts.flushPending(from).catch((e) => this.log.warn(`pending draft not sent: ${e?.code ?? e?.name ?? "error"}`));
  }

  /**
   * A customer's voice note as text (Google Speech, hi-IN), or null. The
   * recording is deleted right after; neither audio nor text is logged.
   */
  private async customerVoice(mediaId: string | undefined): Promise<string | null> {
    if (!mediaId || !this.speech) return null;
    const file = await this.downloadMedia(mediaId);
    try {
      const r = await this.speech.transcribe(file.buf, file.mime);
      return r.ok && r.text.trim() ? r.text.trim() : null;
    } finally {
      await deleteMedia(file.key).catch(() => this.log.warn("voice note not deleted"));
    }
  }

  // ---------- media ----------
  async downloadMedia(mediaId: string, fileName?: string): Promise<IncomingFile> {
    const auth = { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` };
    const metaRes = await fetch(`${graph()}/${mediaId}`, { headers: auth });
    if (!metaRes.ok) throw new Error(`media meta failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { url: string; mime_type: string };
    const fileRes = await fetch(meta.url, { headers: auth });
    if (!fileRes.ok) throw new Error(`media download failed: ${fileRes.status}`);
    const buf = Buffer.from(await fileRes.arrayBuffer());

    const ext = fileName ? extname(fileName) : "." + (meta.mime_type.split("/")[1] || "bin");
    const key = `whatsapp/${process.env.WA_DEFAULT_ORG_ID ?? "org"}/${mediaId}${ext}`;
    if (r2Configured()) {
      await r2Put(key, buf, meta.mime_type);
    } else {
      // Fallback only: container disk is wiped on redeploy — configure R2 in production.
      const dir = process.env.WA_MEDIA_DIR || "./uploads";
      await mkdir(join(dir, "whatsapp"), { recursive: true });
      await writeFile(join(dir, key.replace(/^whatsapp\/[^/]+\//, "whatsapp/")), buf);
    }
    return { key, buf, mime: meta.mime_type };
  }

  // ---------- outgoing ----------
  async sendText(to: string, body: string): Promise<void> {
    const res = await fetch(`${graph()}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      const err = metaErrorOf(json, res.status);
      recordOutbound("reply", false, err);
      this.log.error(`send failed to ${maskPhone(to)}: http=${res.status} code=${err.code ?? "-"} subcode=${err.subcode ?? "-"} msg="${err.message ?? "-"}"`);
      return;
    }
    recordOutbound("reply", true, null);
    const wamid = json?.messages?.[0]?.id ?? "-";
    this.log.log(`sent reply to ${maskPhone(to)} wamid=${wamid}`);
  }

  private async markRead(messageId: string): Promise<void> {
    await fetch(`${graph()}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    }).catch(() => undefined);
  }
}
