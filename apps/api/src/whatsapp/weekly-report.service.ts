import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { istDayStart } from "../tasks/task-rules.js";
import { TasksService } from "../tasks/tasks.service.js";
import { CustomerQuestionsService } from "./customer-questions.service.js";
import { alertNumbers } from "./wa-alerts.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { type WeeklyStats, weeklyDue, weeklyReportText } from "./weekly-report.js";

const WEEK_MS = 7 * 24 * 3600_000;
const JOB = "weekly-report";

/**
 * Every Monday morning the owner gets last week's numbers on WhatsApp (and on
 * "हफ़्ते की रिपोर्ट" any time). Logs say only that it went.
 */
@Injectable()
export class WeeklyReportService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("WeeklyReport");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly outbox: WaOutboxService,
    @Optional() private readonly questions?: CustomerQuestionsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId) return;
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(`weekly report failed: ${e?.name ?? "error"}`)), 5 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private owners(): string[] {
    return alertNumbers(process.env.WA_OWNER_NUMBERS || process.env.WA_ALERT_NUMBERS);
  }

  async tick(now = new Date()): Promise<boolean> {
    const run = await this.prisma.waJobRun.findUnique({ where: { name: JOB } });
    if (!weeklyDue(now, run?.lastRunAt ?? null)) return false;
    // Claimed before sending: one report per Monday even with several instances.
    const claim = run
      ? await this.prisma.waJobRun.updateMany({ where: { name: JOB, lastRunAt: run.lastRunAt }, data: { lastRunAt: now } })
      : await this.prisma.waJobRun.create({ data: { name: JOB, lastRunAt: now } }).then(() => ({ count: 1 }), () => ({ count: 0 }));
    if (!claim.count) return false;
    const text = await this.text(now);
    for (const o of this.owners()) await this.outbox.deliverDirect(o, text, null);
    this.log.log("weekly report sent");
    return true;
  }

  async stats(now = new Date()): Promise<WeeklyStats> {
    const since = new Date(now.getTime() - WEEK_MS);
    const org = this.orgId;
    const owners = this.owners();
    const [writers, newRequests, done, rating, asked, answered, open, learned, nudges, openTasks] = await Promise.all([
      this.prisma.waContact.count({ where: { lastInboundAt: { gte: since }, ...(owners.length ? { phone: { notIn: owners } } : {}) } }),
      this.prisma.draftIntake.count({ where: { organizationId: org, createdAt: { gte: since } } }),
      this.prisma.draftIntake.count({ where: { organizationId: org, workStatus: "DONE", closedAt: { gte: since } } }),
      this.prisma.draftIntake.aggregate({ where: { organizationId: org, ratingAt: { gte: since }, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.waQuestion.count({ where: { organizationId: org, createdAt: { gte: since } } }),
      this.prisma.waQuestion.count({ where: { organizationId: org, answeredAt: { gte: since } } }),
      this.prisma.waQuestion.count({ where: { organizationId: org, status: "OPEN" } }),
      this.prisma.waLearnedAnswer.aggregate({ where: { organizationId: org }, _sum: { uses: true } }),
      this.prisma.waContact.count({ where: { leadNudgedAt: { gte: since } } }),
      this.tasks.openTasks(org),
    ]);
    const names = await this.tasks.userNames(openTasks.map((t) => t.assigneeId));
    const today = istDayStart(now);
    const per = new Map<string, { name: string; open: number; overdue: number }>();
    for (const t of openTasks) {
      const name = t.assigneeId ? (names.get(t.assigneeId) ?? "स्टाफ") : "बिना नाम";
      const row = per.get(name) ?? { name, open: 0, overdue: 0 };
      row.open++;
      if (t.dueAt && t.dueAt < today) row.overdue++;
      per.set(name, row);
    }
    return {
      writers,
      newRequests,
      done,
      ratings: { count: rating._count.rating, avg: rating._avg.rating ?? null },
      questions: { asked, answered, open },
      learnedUsed: learned._sum.uses ?? 0,
      nudges,
      staff: [...per.values()].sort((a, b) => b.open - a.open),
    };
  }

  async text(now = new Date()): Promise<string> {
    const s = await this.stats(now);
    const openQs = s.questions.open && this.questions ? await this.questions.openList(5) : null;
    return weeklyReportText(s, openQs);
  }
}
