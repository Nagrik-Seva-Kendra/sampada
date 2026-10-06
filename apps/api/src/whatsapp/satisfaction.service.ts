import { ForbiddenException, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { Prisma } from "@prisma/client";
import { DEFAULT_OFFICE_FEES, type SatisfactionSettings, type SatisfactionSettingsInput, WA_STATUS_PHRASE, WA_TEMPLATES, WaOfficeFees } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { ownerNumbers } from "./owner-assistant.service.js";
import {
  CHECKLIST_RE,
  checklistText,
  CORRECTION_RE,
  DEFAULT_CORRECTION_POLICY,
  fullCostText,
  packetText,
  RATING_ASK,
  RATING_RE,
  ratingReply,
  simpleSummary,
} from "./satisfaction.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { requestRef } from "./wa-requests.mapper.js";
import { maskPhone } from "./webhook-diagnostics.js";

type RatingState = { mode: "rating"; requestId: string; until: string } | { mode: "feedback"; requestId: string; until: string };
const isManager = (role: string) => role === "OWNER" || role === "ADMIN";

/**
 * Customer satisfaction on WhatsApp: summary + full cost + checklist right
 * after submit, the "full packet" when the work is DONE, a rating question a
 * day later (4-5 → Google review link, 1-3 → feedback to the owner),
 * corrections ("सुधार: ...") after submit, and the correction-deed policy.
 * Logs carry request numbers and counts only.
 */
@Injectable()
export class SatisfactionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("Satisfaction");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly outbox: WaOutboxService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId) return;
    this.timer = setInterval(() => this.askRatings().catch((e) => this.log.error(`ratings failed: ${e?.name ?? "error"}`)), 10 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async config(organizationId: string) {
    const c = await this.prisma.satisfactionConfig.findUnique({ where: { organizationId } });
    return {
      reviewUrl: c?.reviewUrl ?? "",
      correctionPolicy: c?.correctionPolicy || DEFAULT_CORRECTION_POLICY,
      ratingDelayHours: c?.ratingDelayHours ?? 24,
      ratingsEnabled: c?.ratingsEnabled ?? true,
    };
  }

  private async fees(organizationId: string): Promise<WaOfficeFees> {
    const row = await this.prisma.waOfficeFeeConfig.findUnique({ where: { organizationId } }).catch(() => null);
    const parsed = WaOfficeFees.safeParse(row?.config);
    return parsed.success ? parsed.data : DEFAULT_OFFICE_FEES;
  }

  // ---------- after submit / when done ----------
  /** Extra replies after "अनुरोध दर्ज": simple summary, full cost, checklist. */
  async afterSubmit(organizationId: string, id: string, d: any): Promise<string[]> {
    const fee = Number(process.env.GEOTAG_FEE ?? 250);
    const cost = d.deedType === "other" ? null : fullCostText(d, await this.fees(organizationId), Number.isFinite(fee) ? fee : 250);
    return [simpleSummary(requestRef(id), d), ...(cost ? [cost] : []), ...(d.deedType === "other" ? [] : [checklistText(d)])];
  }

  /** On DONE: the full packet (inside the window; outside it the status template already went). */
  async onDone(row: { id: string; organizationId: string; phone: string; data: unknown; registryDate?: string | null; packetSentAt?: Date | null }) {
    if (row.packetSentAt) return;
    const cfg = await this.config(row.organizationId);
    const ref = requestRef(row.id);
    await this.outbox
      .send({
        organizationId: row.organizationId,
        draftIntakeId: row.id,
        kind: "STATUS",
        to: row.phone,
        text: packetText(ref, row.data ?? {}, row.registryDate ?? null, cfg.correctionPolicy),
        template: { name: WA_TEMPLATES.status.name, language: WA_TEMPLATES.status.language, params: [ref, WA_STATUS_PHRASE.DONE] },
      })
      .catch((e) => this.log.error(`packet for request ${ref} not recorded: ${e?.code ?? e?.name ?? "error"}`));
    await this.prisma.draftIntake.update({ where: { id: row.id }, data: { packetSentAt: new Date() } });
  }

  /** Every 10 minutes: the rating question `ratingDelayHours` after DONE (once; within 14 days of DONE). */
  async askRatings(now = new Date()): Promise<number> {
    const cfg = await this.config(this.orgId);
    if (!cfg.ratingsEnabled) return 0;
    const rows = await this.prisma.draftIntake.findMany({
      where: {
        organizationId: this.orgId,
        workStatus: "DONE",
        ratingAskedAt: null,
        closedAt: { lte: new Date(now.getTime() - cfg.ratingDelayHours * 3600_000), gte: new Date(now.getTime() - 14 * 864e5) },
      },
      select: { id: true, phone: true },
      take: 50,
    });
    let n = 0;
    for (const r of rows) {
      const claim = await this.prisma.draftIntake.updateMany({ where: { id: r.id, ratingAskedAt: null }, data: { ratingAskedAt: now } });
      if (!claim.count) continue;
      const ref = requestRef(r.id);
      const d = await this.outbox.deliverDirect(r.phone, RATING_ASK(ref), { name: WA_TEMPLATES.rating.name, language: WA_TEMPLATES.rating.language, params: [ref] });
      // Digits answer the rating for 2 days -- only when the customer is not in another conversation.
      const c = await this.prisma.waContact.findUnique({ where: { phone: r.phone }, select: { state: true } });
      if (!c?.state || (c.state as unknown) === Prisma.DbNull) await this.setState(r.phone, { mode: "rating", requestId: r.id, until: new Date(now.getTime() + 2 * 864e5).toISOString() });
      this.log.log(`rating asked for request ${ref}: ${d.status}`);
      n++;
    }
    return n;
  }

  private async setState(phone: string, state: RatingState | null) {
    await this.prisma.waContact.upsert({
      where: { phone },
      create: { phone, lastInboundAt: new Date(), state: (state ?? undefined) as any },
      update: { state: state ? (state as any) : Prisma.DbNull },
    });
  }

  // ---------- customer replies ----------
  /** Rating / feedback / correction / checklist; null when the text is none of these. */
  async handle(phone: string, text: string, now = new Date()): Promise<string[] | null> {
    if (!this.orgId) return null;
    const c = await this.prisma.waContact.findUnique({ where: { phone }, select: { state: true } });
    const st = (c?.state ?? null) as RatingState | null;
    const live = st && (st.mode === "rating" || st.mode === "feedback") && Date.parse(st.until) > now.getTime() ? st : null;
    const v = text.trim().replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
    if (live?.mode === "rating") {
      const m = v.match(RATING_RE);
      if (m) {
        const rating = Number(m[1]);
        await this.prisma.draftIntake.updateMany({ where: { id: live.requestId, phone }, data: { rating, ratingAt: now } });
        const cfg = await this.config(this.orgId);
        await this.setState(phone, rating <= 3 ? { mode: "feedback", requestId: live.requestId, until: new Date(now.getTime() + 2 * 864e5).toISOString() } : null);
        this.log.log(`rating ${rating} for request ${requestRef(live.requestId)}`);
        if (rating <= 3) await this.alertOwner(`⚠️ अनुरोध ${requestRef(live.requestId)} को ${rating}/5 रेटिंग मिली (${maskPhone(phone)})।`, null, `अनुरोध ${requestRef(live.requestId)}`);
        return [ratingReply(rating, cfg.reviewUrl || null)];
      }
    }
    if (live?.mode === "feedback" && v.length >= 2 && !RATING_RE.test(v)) {
      await this.prisma.draftIntake.updateMany({ where: { id: live.requestId, phone }, data: { feedback: v.slice(0, 1000) } });
      await this.setState(phone, null);
      await this.alertOwner(`📝 अनुरोध ${requestRef(live.requestId)} — कम रेटिंग पर ग्राहक की बात दर्ज हुई। WhatsApp अनुरोध पेज पर देखें।`, null, `अनुरोध ${requestRef(live.requestId)}`);
      return ["धन्यवाद, आपकी बात मालिक तक पहुँचा दी गई है। हम सुधार करेंगे।"];
    }
    if (CHECKLIST_RE.test(v)) {
      const last = await this.latest(phone);
      // No request yet: what the draft needs first, then the registry-day list.
      return last
        ? [checklistText(last.data ?? {})]
        : ["📄 ड्राफ्ट बनवाने के लिए: संपत्ति की पुरानी रजिस्ट्री की PDF या सभी पन्नों की साफ़ फ़ोटो यहीं भेजें।", checklistText({})];
    }
    if (CORRECTION_RE.test(v)) {
      const last = await this.latest(phone);
      if (!last) return null;
      if (last.workStatus === "DONE") {
        const cfg = await this.config(this.orgId);
        return [`अनुरोध ${requestRef(last.id)} का काम पूरा हो चुका है।\n${cfg.correctionPolicy}\nस्टाफ आपसे संपर्क करेगा।`];
      }
      const note = v.replace(CORRECTION_RE, "").replace(/^[\s:：-]+/, "").trim();
      if (note.length < 3) return ['क्या सुधार करना है, साथ में लिखें — जैसे "सुधार: पिता का नाम मोहन लाल है"।'];
      const list = Array.isArray(last.corrections) ? (last.corrections as any[]) : [];
      await this.prisma.draftIntake.update({ where: { id: last.id }, data: { corrections: [...list, { text: note.slice(0, 500), at: now.toISOString() }].slice(-20) as any } });
      await this.alertOwner(`✏️ अनुरोध ${requestRef(last.id)} में ग्राहक ने सुधार भेजा। WhatsApp अनुरोध पेज पर देखें।`, last.assigneeId, `अनुरोध ${requestRef(last.id)}`);
      this.log.log(`correction for request ${requestRef(last.id)}`);
      return [`✏️ आपका सुधार अनुरोध ${requestRef(last.id)} में दर्ज हो गया। स्टाफ ड्राफ्ट में ठीक करेगा।`];
    }
    return null;
  }

  private latest(phone: string) {
    return this.prisma.draftIntake.findFirst({
      where: { organizationId: this.orgId, phone, status: "SUBMITTED", workStatus: { not: "REJECTED" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, workStatus: true, data: true, corrections: true, assigneeId: true },
    });
  }

  /** `ref`: the record the alert is about ("अनुरोध AB12CD") -- the template needs it. */
  private async alertOwner(text: string, assigneeId: string | null, ref: string) {
    const to = new Set(ownerNumbers());
    if (assigneeId) {
      const u = await this.prisma.user.findFirst({ where: { id: assigneeId }, select: { mobile: true } });
      const ten = (u?.mobile ?? "").replace(/\D/g, "").slice(-10);
      if (/^[6-9]\d{9}$/.test(ten)) to.add(`91${ten}`);
    }
    for (const n of to) {
      await this.outbox.deliverDirect(n, text, { name: WA_TEMPLATES.staffNotice.name, language: WA_TEMPLATES.staffNotice.language, params: ["जी", ref, text.replace(/\s+/g, " ")] }).catch(() => undefined);
    }
  }

  // ---------- web ----------
  async settings(): Promise<SatisfactionSettings> {
    const t = requireTenantContext(this.cls);
    if (!isManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    const cfg = await this.config(t.organizationId);
    const since = new Date(Date.now() - 90 * 864e5);
    const rows = await this.prisma.draftIntake.findMany({
      where: { organizationId: t.organizationId, closedAt: { gte: since } },
      select: { id: true, rating: true, ratingAskedAt: true, ratingAt: true, feedback: true, corrections: true },
    });
    const rated = rows.filter((r) => r.rating != null);
    return {
      ...cfg,
      canManage: t.role === "OWNER",
      stats: {
        asked: rows.filter((r) => r.ratingAskedAt).length,
        rated: rated.length,
        average: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 10) / 10 : null,
        low: rated.filter((r) => r.rating! <= 3).length,
        corrections: rows.filter((r) => Array.isArray(r.corrections) && (r.corrections as any[]).length).length,
      },
      lowRatings: rated
        .filter((r) => r.rating! <= 3)
        .sort((a, b) => (b.ratingAt?.getTime() ?? 0) - (a.ratingAt?.getTime() ?? 0))
        .slice(0, 20)
        .map((r) => ({ requestId: r.id, ref: requestRef(r.id), rating: r.rating!, feedback: r.feedback, at: (r.ratingAt ?? new Date()).toISOString() })),
    };
  }

  async save(input: SatisfactionSettingsInput): Promise<SatisfactionSettings> {
    const t = requireTenantContext(this.cls);
    if (t.role !== "OWNER") throw new ForbiddenException("ये सेटिंग केवल मालिक बदल सकते हैं।");
    await this.prisma.satisfactionConfig.upsert({ where: { organizationId: t.organizationId }, create: { organizationId: t.organizationId, ...input }, update: input });
    return this.settings();
  }
}
