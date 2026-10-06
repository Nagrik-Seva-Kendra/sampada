import { fullPhone } from "./chat-words.js";
import { createHash, randomInt } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { Prisma } from "@prisma/client";
import { type ArchiveCopyDeed, type ArchiveCopyItem, type ArchiveCopySettings, maskIdNumbers } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { maskPhone } from "./webhook-diagnostics.js";

const OTP_MS = 10 * 60 * 1000;
const MAX_TRIES = 3;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const COPY_RE = /(पुरानी\s*रजिस्ट्री|रजिस्ट्री\s*की\s*(कॉपी|कापी|प्रति|नकल)|registry\s*(ki\s*)?copy|purani\s*registry|old\s*registry|कॉपी\s*चाहिए|copy\s*chahiye)/i;
const IST_MS = 5.5 * 3600 * 1000;
const istDayStart = (now: Date) => {
  const d = new Date(now.getTime() + IST_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_MS);
};
const hash = (code: string, phone: string) => createHash("sha256").update(`${phone}:${code}`).digest("hex");
const isManager = (role: string) => role === "OWNER" || role === "ADMIN";

type CopyState =
  | { mode: "copy"; step: "OTP"; otp: string; until: string; tries: number; deedIds: string[] }
  | { mode: "copy"; step: "PICK"; until: string; deedIds: string[] };

/**
 * "पुरानी रजिस्ट्री की कॉपी": OFF by default (owner switches it on). Only deeds
 * that match this WhatsApp number exactly -- the request it came from, or the
 * 10 digits written in the deed. A one-time code confirms; then the customer
 * picks a deed and staff send a watermarked PDF from the web. At most
 * `dailyLimit` a day per number. Logs: masked numbers and counts only.
 */
@Injectable()
export class ArchiveCopyService {
  private readonly log = new Logger("ArchiveCopy");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly outbox: WaOutboxService,
  ) {}

  private async setting(organizationId: string) {
    const s = await this.prisma.archiveCopySetting.findUnique({ where: { organizationId } });
    return { enabled: s?.enabled ?? false, dailyLimit: s?.dailyLimit ?? 3 };
  }

  /** Deeds of this number (bot context: explicit org, audited bypass of tenant scope). */
  async deedsFor(organizationId: string, phone: string): Promise<{ id: string; title: string; createdAt: Date }[]> {
    const ten = phone.slice(-10);
    const reqs = await this.prisma.draftIntake.findMany({
      where: { organizationId, phone, status: "SUBMITTED", deedTemplateId: { not: null } },
      select: { deedTemplateId: true },
    });
    const ids = reqs.map((r) => r.deedTemplateId!).filter(Boolean);
    const db = this.prisma.$unscoped;
    const byText = await db.deedTemplate.findMany({
      // The number as written in deeds: "9876543210", "98765 43210", "98765-43210".
      where: { organizationId, status: "active", OR: [ten, `${ten.slice(0, 5)} ${ten.slice(5)}`, `${ten.slice(0, 5)}-${ten.slice(5)}`].map((v) => ({ content: { contains: v } })) },
      select: { id: true, title: true, createdAt: true, content: true },
      take: 50,
    });
    // Exact match: the 10 digits must stand alone (not inside a longer number).
    const exact = byText.filter((d) => new RegExp(`(?<!\\d)(?:\\+?91[\\s-]?)?${ten}(?!\\d)`).test(d.content.replace(/[\s-](?=\d)/g, "")));
    const linked = ids.length ? await db.deedTemplate.findMany({ where: { organizationId, status: "active", id: { in: ids } }, select: { id: true, title: true, createdAt: true } }) : [];
    const all = new Map<string, { id: string; title: string; createdAt: Date }>();
    for (const d of [...linked, ...exact]) all.set(d.id, { id: d.id, title: d.title, createdAt: d.createdAt });
    return [...all.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 9);
  }

  private async todayCount(phone: string, now: Date) {
    return this.prisma.archiveCopyRequest.count({ where: { phone, createdAt: { gte: istDayStart(now) } } });
  }

  private async state(phone: string): Promise<CopyState | null> {
    const c = await this.prisma.waContact.findUnique({ where: { phone }, select: { state: true } });
    const s = (c?.state ?? null) as CopyState | null;
    return s?.mode === "copy" && Date.parse(s.until) > Date.now() ? s : null;
  }

  private async setState(phone: string, state: CopyState | null) {
    await this.prisma.waContact.upsert({
      where: { phone },
      create: { phone, lastInboundAt: new Date(), state: (state ?? undefined) as any },
      update: { state: state ? (state as any) : Prisma.DbNull },
    });
  }

  /** Bot: a text from a customer with no draft conversation. null = not about copies. */
  async handle(phone: string, text: string, now = new Date()): Promise<string[] | null> {
    if (!this.orgId) return null;
    const st = await this.state(phone);
    const v = text.trim().replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
    if (st && /^(रद्द|cancel|radd|बंद)$/i.test(v)) {
      await this.setState(phone, null);
      return ["ठीक है, कॉपी का अनुरोध रद्द किया।"];
    }
    if (st?.step === "OTP") {
      if (!/^\d{6}$/.test(v)) return ['कृपया ऊपर भेजा गया 6 अंकों का कोड लिखें। रद्द करने के लिए "रद्द" लिखें।'];
      if (hash(v, phone) !== st.otp) {
        const tries = st.tries + 1;
        if (tries >= MAX_TRIES) {
          await this.setState(phone, null);
          return ["कोड 3 बार गलत रहा। सुरक्षा के लिए अनुरोध बंद किया गया — बाद में फिर से कोशिश करें।"];
        }
        await this.setState(phone, { ...st, tries });
        return [`कोड गलत है। ${MAX_TRIES - tries} बार और कोशिश कर सकते हैं।`];
      }
      await this.setState(phone, { mode: "copy", step: "PICK", until: new Date(now.getTime() + OTP_MS).toISOString(), deedIds: st.deedIds });
      return [await this.listText(st.deedIds)];
    }
    if (st?.step === "PICK") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > st.deedIds.length) return [`कृपया 1 से ${st.deedIds.length} तक कोई नंबर लिखें।`];
      return this.pick(phone, st.deedIds[n - 1]!, now);
    }
    if (!COPY_RE.test(text)) return null;
    const cfg = await this.setting(this.orgId);
    if (!cfg.enabled) return ['रजिस्ट्री की कॉपी WhatsApp पर देने की सुविधा अभी शुरू नहीं हुई है। स्टाफ से बात के लिए "4" लिखें।'];
    if ((await this.todayCount(phone, now)) >= cfg.dailyLimit) return [`आज की सीमा (${cfg.dailyLimit} कॉपी) पूरी हो गई है। कल फिर से अनुरोध करें।`];
    const deeds = await this.deedsFor(this.orgId, phone);
    if (!deeds.length) return ['इस WhatsApp नंबर से जुड़ी कोई रजिस्ट्री हमारे रिकॉर्ड में नहीं मिली। स्टाफ से बात के लिए "4" लिखें।'];
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.setState(phone, { mode: "copy", step: "OTP", otp: hash(code, phone), until: new Date(now.getTime() + OTP_MS).toISOString(), tries: 0, deedIds: deeds.map((d) => d.id) });
    this.log.log(`copy code sent to ${maskPhone(phone)} (${deeds.length} deed(s))`);
    return [`🔐 आपका सत्यापन कोड: ${code}\n(10 मिनट तक मान्य। यह कोड किसी को न बताएँ।)`, "रजिस्ट्री की कॉपी के लिए ऊपर का 6 अंकों का कोड यहाँ लिखें।"];
  }

  private async listText(ids: string[]): Promise<string> {
    const deeds = await this.prisma.$unscoped.deedTemplate.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, createdAt: true } });
    const lines = ids.map((id, i) => {
      const d = deeds.find((x) => x.id === id);
      const date = d ? d.createdAt.toISOString().slice(0, 10).split("-").reverse().join("/") : "";
      return `${i + 1}. ${maskIdNumbers(d?.title ?? "रजिस्ट्री")} (${date})`;
    });
    return ["✅ सत्यापन हो गया। किस रजिस्ट्री की कॉपी चाहिए? नंबर लिखें:", ...lines].join("\n");
  }

  private async pick(phone: string, deedId: string, now: Date): Promise<string[]> {
    const cfg = await this.setting(this.orgId);
    await this.setState(phone, null);
    if ((await this.todayCount(phone, now)) >= cfg.dailyLimit) return [`आज की सीमा (${cfg.dailyLimit} कॉपी) पूरी हो गई है।`];
    let row: any = null;
    for (let i = 0; i < 5 && !row; i++) {
      const last = await this.prisma.archiveCopyRequest.findFirst({ where: { organizationId: this.orgId }, orderBy: { number: "desc" }, select: { number: true } });
      try {
        row = await this.prisma.archiveCopyRequest.create({ data: { organizationId: this.orgId, number: (last?.number ?? 0) + 1, phone, deedId } });
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
      }
    }
    this.log.log(`copy request #${row.number} from ${maskPhone(phone)}`);
    await this.outbox.alertOwners(`📄 रजिस्ट्री कॉपी अनुरोध #${row.number} (${fullPhone(phone)}) — WhatsApp अनुरोध पेज पर जाँचकर भेजें।`).catch(() => undefined);
    return [`📄 अनुरोध #${row.number} दर्ज हो गया। स्टाफ जाँचकर रजिस्ट्री की कॉपी (केवल जानकारी हेतु, watermark के साथ) इसी नंबर पर भेजेगा।`];
  }

  // ---------- web (OWNER/ADMIN) ----------
  private manager() {
    const t = requireTenantContext(this.cls);
    if (!isManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    return t;
  }

  async settings(): Promise<ArchiveCopySettings> {
    const t = this.manager();
    return { ...(await this.setting(t.organizationId)), canManage: t.role === "OWNER" };
  }

  async saveSettings(enabled: boolean, dailyLimit: number): Promise<ArchiveCopySettings> {
    const t = requireTenantContext(this.cls);
    if (t.role !== "OWNER") throw new ForbiddenException("यह सुविधा केवल मालिक चालू/बंद कर सकते हैं।");
    await this.prisma.archiveCopySetting.upsert({
      where: { organizationId: t.organizationId },
      create: { organizationId: t.organizationId, enabled, dailyLimit },
      update: { enabled, dailyLimit },
    });
    this.log.log(`archive copy ${enabled ? "on" : "off"} (limit ${dailyLimit})`);
    return this.settings();
  }

  async list(): Promise<ArchiveCopyItem[]> {
    const t = this.manager();
    const rows = await this.prisma.archiveCopyRequest.findMany({ where: { organizationId: t.organizationId }, orderBy: { createdAt: "desc" }, take: 100 });
    const deeds = rows.length ? await this.prisma.deedTemplate.findMany({ where: { id: { in: rows.map((r) => r.deedId) } }, select: { id: true, title: true } }) : [];
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      phoneMasked: maskPhone(r.phone),
      deedId: r.deedId,
      deedTitle: maskIdNumbers(deeds.find((d) => d.id === r.deedId)?.title ?? "—"),
      status: r.status as ArchiveCopyItem["status"],
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
      reason: r.reason,
    }));
  }

  private async request(id: string) {
    const t = this.manager();
    const r = await this.prisma.archiveCopyRequest.findFirst({ where: { id, organizationId: t.organizationId } });
    if (!r) throw new NotFoundException("अनुरोध नहीं मिला।");
    return { t, r };
  }

  /** Deed text for the browser's PDF, Aadhaar/PAN cut to the last 4, with the watermark line. */
  async deed(id: string): Promise<ArchiveCopyDeed> {
    const { r } = await this.request(id);
    const d = await this.prisma.deedTemplate.findFirst({ where: { id: r.deedId }, select: { title: true, content: true } });
    if (!d) throw new NotFoundException("डीड नहीं मिली।");
    const date = new Date(Date.now() + IST_MS).toISOString().slice(0, 10).split("-").reverse().join(".");
    return {
      title: maskIdNumbers(d.title),
      content: maskIdNumbers(d.content),
      fileName: `registry-copy-${r.number}.pdf`,
      watermark: `केवल जानकारी हेतु — प्रमाणित प्रति नहीं · नागरिक सेवा केंद्र · ${date} · ${maskPhone(r.phone)}`,
    };
  }

  async send(id: string, pdfBase64: string): Promise<ArchiveCopyItem> {
    const { t, r } = await this.request(id);
    if (r.status !== "REQUESTED") throw new BadRequestException("यह अनुरोध पहले ही निपट चुका है।");
    const pdf = Buffer.from(pdfBase64, "base64");
    if (pdf.length > MAX_PDF_BYTES) throw new BadRequestException("PDF बहुत बड़ी है (10MB तक)।");
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new BadRequestException("यह PDF फ़ाइल नहीं है।");
    const d = await this.outbox.deliverDocumentDirect(r.phone, `रजिस्ट्री की कॉपी (अनुरोध #${r.number}) — केवल जानकारी हेतु, प्रमाणित प्रति नहीं।`, pdf, `registry-copy-${r.number}.pdf`);
    await this.prisma.archiveCopyRequest.update({
      where: { id: r.id },
      data: d.status === "SENT" ? { status: "SENT", sentAt: new Date(), sentById: t.userId, reason: null } : { reason: d.reason },
    });
    this.log.log(`copy #${r.number}: ${d.status}`);
    return (await this.list()).find((x) => x.id === r.id)!;
  }

  async reject(id: string): Promise<ArchiveCopyItem> {
    const { r } = await this.request(id);
    await this.prisma.archiveCopyRequest.update({ where: { id: r.id }, data: { status: "REJECTED" } });
    await this.outbox.deliverDirect(r.phone, `रजिस्ट्री कॉपी अनुरोध #${r.number} पूरा नहीं हो सका। कृपया ऑफिस से संपर्क करें।`, null).catch(() => undefined);
    return (await this.list()).find((x) => x.id === r.id)!;
  }
}

