import { ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { ArchiveRiskResult } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { targetPlace } from "../ai-draft/ai-draft.service.js";
import { type DraftIntakeRow, toDetail } from "../whatsapp/wa-requests.mapper.js";
import { type ArchiveDeedFacts, factsOf, normNumber, riskWarnings, sameProperty } from "./risk-rules.js";

const isManager = (role: string) => role === "OWNER" || role === "ADMIN";
const TYPES = ["sale-deed", "equitable-mortgage-deed", "reconveyance-deed", "gift-deed", "release-deed", "partition-deed"];
const BATCH = 200;

/**
 * Archive risk check. A property index of the office's own deeds (built in
 * the background: new or edited deeds every hour, the whole archive the first
 * time) gives, for a WhatsApp request's property, warnings: sold before by the
 * same seller, a broken chain, a mortgage without a re-conveyance. Reads the
 * archive with the audited unscoped client (explicit organization) in the job.
 * Logs counts only.
 */
@Injectable()
export class ArchiveRiskService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("ArchiveRisk");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;
  private lastRunAt: Date | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId) return;
    const run = () => this.backfill(this.orgId).catch((e) => this.log.error(`backfill failed: ${e?.name ?? "error"}`));
    setTimeout(run, 30_000).unref?.();
    this.timer = setInterval(run, 3600_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Indexes this org's deeds that are new or changed since they were last read. */
  async backfill(organizationId: string): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const db = this.prisma.$unscoped;
      const deeds = await db.deedTemplate.findMany({ where: { organizationId, type: { in: TYPES } }, select: { id: true, updatedAt: true } });
      const idx = await db.propertyIndexEntry.findMany({ where: { organizationId }, select: { deedId: true, indexedAt: true } });
      const at = new Map(idx.map((i) => [i.deedId, i.indexedAt]));
      const stale = deeds.filter((d) => !at.has(d.id) || at.get(d.id)! < d.updatedAt).map((d) => d.id);
      for (let i = 0; i < stale.length; i += BATCH) {
        const rows = await db.deedTemplate.findMany({ where: { id: { in: stale.slice(i, i + BATCH) } }, select: { id: true, type: true, content: true, createdAt: true } });
        for (const r of rows) {
          const f = factsOf(r.content);
          const data = {
            organizationId,
            deedType: r.type,
            number: f.number,
            colony: f.colony,
            village: f.village,
            ward: f.ward,
            tehsil: f.tehsil,
            district: f.district,
            sellers: f.sellers,
            buyers: f.buyers,
            deedDate: r.createdAt,
            indexedAt: new Date(),
          };
          await db.propertyIndexEntry.upsert({ where: { deedId: r.id }, create: { deedId: r.id, ...data }, update: data });
        }
      }
      this.lastRunAt = new Date();
      if (stale.length) this.log.log(`property index: ${stale.length} deed(s) read`);
      return stale.length;
    } finally {
      this.running = false;
    }
  }

  /** Request page (OWNER/ADMIN or the assignee): warnings for the request's property and sellers. */
  async forRequest(id: string): Promise<ArchiveRiskResult> {
    const t = requireTenantContext(this.cls);
    const row = (await this.prisma.draftIntake.findFirst({ where: { id, organizationId: t.organizationId } })) as DraftIntakeRow | null;
    if (!row || (!isManager(t.role) && row.assigneeId !== t.userId)) throw new NotFoundException("अनुरोध नहीं मिला।");
    const d = toDetail(row, null, true);
    const p = d.registry?.property ?? null;
    const target = { ...targetPlace(p), number: normNumber(p?.khasraOrPlotNo) };
    const index = await this.indexStatus(t.organizationId);
    if (!target.number || !(target.village || target.colony)) return { checked: false, warnings: [], sameProperty: 0, index };
    // Sellers of the new deed = owners in the customer's old registry (or the mortgagor).
    const sellers = d.deedType === "mortgage" ? (d.mortgage?.people[0]?.name ? [d.mortgage.people[0].name] : []) : (d.registry?.currentOwners ?? []).map((o) => o.name);
    const rows = await this.prisma.propertyIndexEntry.findMany({ where: { organizationId: t.organizationId, number: target.number } });
    const titles = rows.length
      ? await this.prisma.deedTemplate.findMany({ where: { id: { in: rows.map((r) => r.deedId) } }, select: { id: true, title: true } })
      : [];
    const archive: ArchiveDeedFacts[] = rows.map((r) => ({
      deedId: r.deedId,
      deedType: r.deedType,
      title: titles.find((x) => x.id === r.deedId)?.title ?? "—",
      date: r.deedDate,
      number: r.number,
      colony: r.colony,
      village: r.village,
      ward: r.ward,
      tehsil: r.tehsil,
      district: r.district,
      sellers: (r.sellers as string[]) ?? [],
      buyers: (r.buyers as string[]) ?? [],
    }));
    const linked = (row as any).deedTemplateId as string | undefined;
    const warnings = riskWarnings(target, sellers, archive, linked);
    const same = archive.filter((a) => a.deedId !== linked && sameProperty(target, a)).length;
    return {
      checked: true,
      warnings: warnings.map((w) => ({ ...w, deedType: archive.find((a) => a.deedId === w.deedId)?.deedType ?? "" })),
      sameProperty: same,
      index,
    };
  }

  private async indexStatus(organizationId: string) {
    const [indexed, total] = await Promise.all([
      this.prisma.propertyIndexEntry.count({ where: { organizationId } }),
      this.prisma.deedTemplate.count({ where: { type: { in: TYPES } } }),
    ]);
    return { indexed, total, lastRunAt: this.lastRunAt?.toISOString() ?? null };
  }

  /** OWNER/ADMIN: read new / changed deeds now. */
  async runNow(): Promise<{ read: number }> {
    const t = requireTenantContext(this.cls);
    if (!isManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    return { read: await this.backfill(t.organizationId) };
  }
}

