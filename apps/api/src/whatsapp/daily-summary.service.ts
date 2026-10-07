import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { WA_TEMPLATES } from "@sampada/shared";
import { AttendanceService } from "../attendance/attendance.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { istDayStart } from "../tasks/task-rules.js";
import { type DailyStats, summaryDue, summaryParams, summaryText } from "./daily-summary.js";
import { alertNumbers } from "./wa-alerts.js";
import { WaOutboxService } from "./wa-outbox.service.js";

const JOB = "owner-daily-summary";
const OPEN = ["NEW", "IN_PROGRESS", "DRAFT_READY", "CUSTOMER_APPROVED", "CORRECTION_REQUESTED"];

/**
 * The owner's evening summary: once a day from WA_DAILY_SUMMARY_TIME (IST,
 * 20:30) to WA_OWNER_NUMBERS -- free text inside the 24-hour window, else the
 * owner_daily_summary_v1 template (outbox.deliverDirect decides). Claimed in
 * WaJobRun first, so a restart or a second instance never sends it twice.
 * Off by WA_DAILY_SUMMARY=off or the app's attendance setting. Logs counts only.
 */
@Injectable()
export class DailySummaryService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("DailySummary");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: WaOutboxService,
    private readonly attendance: AttendanceService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId) return;
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(`daily summary failed: ${e?.name ?? "error"}`)), 5 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private owners(): string[] {
    return alertNumbers(process.env.WA_OWNER_NUMBERS || process.env.WA_ALERT_NUMBERS);
  }

  async enabled(): Promise<boolean> {
    if (/^(off|false|0|no)$/i.test(process.env.WA_DAILY_SUMMARY ?? "")) return false;
    const s = await this.attendance.settings(this.orgId).catch(() => null);
    return s?.ownerDailySummary ?? true;
  }

  async tick(now = new Date()): Promise<boolean> {
    if (!this.orgId) return false;
    const run = await this.prisma.waJobRun.findUnique({ where: { name: JOB } });
    if (!summaryDue(now, run?.lastRunAt ?? null)) return false;
    if (!(await this.enabled())) return false;
    // Claimed before sending: one summary a day even after a restart or with two instances.
    const claim = run
      ? await this.prisma.waJobRun.updateMany({ where: { name: JOB, lastRunAt: run.lastRunAt }, data: { lastRunAt: now } })
      : await this.prisma.waJobRun.create({ data: { name: JOB, lastRunAt: now } }).then(
          () => ({ count: 1 }),
          () => ({ count: 0 }),
        );
    if (!claim.count) return false;
    const s = await this.stats(now);
    let sent = 0;
    for (const o of this.owners()) {
      const d = await this.outbox.deliverDirect(o, summaryText(s, now), {
        name: WA_TEMPLATES.ownerDailySummary.name,
        language: WA_TEMPLATES.ownerDailySummary.language,
        params: summaryParams(s, now),
      });
      if (d.status === "SENT") sent++;
    }
    this.log.log(`daily summary: sent to ${sent} of ${this.owners().length} owner number(s)`);
    return true;
  }

  async stats(now = new Date()): Promise<DailyStats> {
    const org = this.orgId;
    const today = istDayStart(now);
    const [created, closed, pending, attendance] = await Promise.all([
      this.prisma.draftIntake.count({ where: { organizationId: org, createdAt: { gte: today }, status: { not: "CANCELLED" } } }),
      this.prisma.draftIntake.count({ where: { organizationId: org, workStatus: { in: ["DONE", "REJECTED"] }, closedAt: { gte: today } } }),
      this.prisma.draftIntake.count({ where: { organizationId: org, status: "SUBMITTED", workStatus: { in: OPEN } } }),
      this.attendance.todayMissing(org, now).catch(() => null),
    ]);
    return { created, closed, pending, attendance };
  }

  /** "सारांश" from the owner: the same summary now. */
  async text(now = new Date()): Promise<string> {
    return summaryText(await this.stats(now), now);
  }
}
