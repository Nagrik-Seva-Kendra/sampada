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
      if (testing && /^(ओनर|owner|मालिक|malik)\s*(मोड|mode)$/i.test(body.trim())) {
        await this.send(from, await this.owner.endCustomerTest(from));
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
    // A colony project's company people (company mode): plot status, counts, sale drafts.
    if (msg.type === "text" && this.colony) {
      const company = await this.colony.handleCompany(from, String(msg.text?.body ?? ""));
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
      default:
        await this.send(from, await this.front.withoutRepeats(from, ["कृपया टेक्स्ट संदेश, फ़ोटो या PDF भेजें।"]));
        this.log.log(`message ${msg.id} from ${maskPhone(from)} type=${msg.type} route=unsupported`);
    }
  }

  /** One debounced batch of texts from a number: draft review → draft flow → front door (menu ...). */
  async handleTexts(from: string, batch: DebouncedBatch): Promise<void> {
    const text = batch.texts.map((t) => t.trim()).filter(Boolean).join("\n");
    const ctx = { phone: from, name: batch.name };
    let route: string;
    let replies: string[];
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
        // Generic answers are never repeated within 10 minutes.
        replies = await this.front.withoutRepeats(from, r.replies);
      }
    }
    await this.send(from, replies);
    if (route !== "abuse" && route !== "blocked") await this.afterReply(from);
    this.log.log(`text batch from ${maskPhone(from)} messages=${batch.texts.length} route=${route} replies=${replies.length}`);
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
