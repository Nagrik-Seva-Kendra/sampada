import { Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { PrismaService } from "../prisma/prisma.service.js";
import { r2Configured, r2Put } from "../guideline/r2.js";
import { DraftIntakeService, type IncomingFile } from "./draft-intake.service.js";

const graph = () => `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || "v21.0"}`;

@Injectable()
export class WhatsappService {
  private readonly log = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: DraftIntakeService,
  ) {}

  // ---------- security ----------
  isValidSignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
    const secret = process.env.WA_APP_SECRET;
    if (!secret || !rawBody || !header?.startsWith("sha256=")) return false;
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
    const received = Buffer.from(header.slice("sha256=".length), "hex");
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  // ---------- incoming ----------
  async handlePayload(body: any): Promise<void> {
    if (body?.object !== "whatsapp_business_account") return;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const contact = value?.contacts?.[0];
        for (const msg of value?.messages ?? []) {
          if (!(await this.firstTime(msg.id))) continue; // Meta retries → ignore duplicates
          try {
            await this.handleMessage(msg, msg.from, contact?.profile?.name ?? "");
          } catch (e: any) {
            this.log.error(`message ${msg.id} failed: ${e?.message}`);
            await this.sendText(msg.from, "क्षमा करें, तकनीकी समस्या आई। हमारा स्टाफ आपसे संपर्क करेगा।");
          }
        }
      }
    }
  }

  /** Records the WhatsApp message id; false if it was already processed. */
  private async firstTime(waMessageId: string): Promise<boolean> {
    try {
      await this.prisma.waInboundMessage.create({ data: { waMessageId } });
      return true;
    } catch {
      return false; // unique violation = duplicate delivery
    }
  }

  private async handleMessage(msg: any, from: string, name: string): Promise<void> {
    await this.markRead(msg.id);
    const ctx = { phone: from, name };
    let replies: string[];

    switch (msg.type) {
      case "text": {
        const r = await this.intake.handleText(ctx, msg.text?.body ?? "");
        // TODO (next phase): when r is null, answer guideline/act questions via the AI bot.
        replies = r ?? [`नमस्ते ${name}, आपका संदेश मिल गया है। नागरिक सेवा केंद्र जल्द जवाब देगा।`];
        break;
      }
      case "document":
      case "image": {
        const media = msg[msg.type]; // { id, mime_type, filename?, caption? }
        const file = await this.downloadMedia(media.id, media.filename);
        replies = await this.intake.handleDocument(ctx, file);
        break;
      }
      default:
        replies = ["कृपया टेक्स्ट संदेश, फ़ोटो या PDF भेजें।"];
    }
    for (const r of replies) if (r) await this.sendText(from, r);
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
    if (!res.ok) this.log.error(`send failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  private async markRead(messageId: string): Promise<void> {
    await fetch(`${graph()}/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    }).catch(() => undefined);
  }
}
