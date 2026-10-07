import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { type LeadKind, NUDGE_AFTER_MS, NUDGE_BEFORE_MS, NUDGE_GAP_MS, nudgeHours, nudgeText } from "./lead-nudge.js";
import { alertNumbers } from "./wa-alerts.js";
import { WaOutboxService } from "./wa-outbox.service.js";

/**
 * Every 10 minutes: customers who showed interest but sent no papers get one
 * reminder 20-23 hours after their last message (still inside the 24-hour
 * window, so plain text). Never twice in 7 days, never to a blocked / opted-out
 * number, never once a request exists. Logs counts only.
 */
@Injectable()
export class LeadNudgeService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("LeadNudge");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: WaOutboxService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId || process.env.WA_LEAD_NUDGE === "off") return;
    this.timer = setInterval(() => this.run().catch((e) => this.log.error(`lead nudges failed: ${e?.name ?? "error"}`)), 10 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<number> {
    if (!nudgeHours(now) || !process.env.WA_ACCESS_TOKEN) return 0;
    const owners = alertNumbers(process.env.WA_OWNER_NUMBERS || process.env.WA_ALERT_NUMBERS);
    const rows = await this.prisma.waContact.findMany({
      where: {
        leadAt: { not: null, lte: new Date(now.getTime() - NUDGE_AFTER_MS) },
        lastInboundAt: { gt: new Date(now.getTime() - NUDGE_BEFORE_MS), lte: new Date(now.getTime() - NUDGE_AFTER_MS) },
        blockedAt: null,
        followUpOptOutAt: null,
        OR: [{ leadNudgedAt: null }, { leadNudgedAt: { lt: new Date(now.getTime() - NUDGE_GAP_MS) } }],
        ...(owners.length ? { phone: { notIn: owners } } : {}),
      },
      select: { phone: true, leadKind: true, leadAt: true, leadNudgedAt: true },
      take: 100,
    });
    let sent = 0;
    for (const c of rows) {
      // Papers came (a request was started) after the interest: nothing to remind.
      const started = await this.prisma.draftIntake.count({ where: { phone: c.phone, createdAt: { gte: c.leadAt! } } });
      if (started) {
        await this.prisma.waContact.updateMany({ where: { phone: c.phone }, data: { leadAt: null, leadKind: null } });
        continue;
      }
      // Claim first: several instances never send twice.
      const claim = await this.prisma.waContact.updateMany({ where: { phone: c.phone, leadNudgedAt: c.leadNudgedAt ?? null }, data: { leadNudgedAt: now, leadAt: null } });
      if (!claim.count) continue;
      const r = await this.outbox.post(c.phone, { type: "text", text: { body: nudgeText((c.leadKind as LeadKind) ?? "draft") } });
      if (r.ok) sent++;
    }
    if (rows.length) this.log.log(`lead nudges: ${sent} sent of ${rows.length}`);
    return sent;
  }
}
