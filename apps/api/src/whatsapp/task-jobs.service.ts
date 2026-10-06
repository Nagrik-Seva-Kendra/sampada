import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { WA_TEMPLATES } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { digestText, formatDueHi, istDayStart } from "../tasks/task-rules.js";
import { TasksService } from "../tasks/tasks.service.js";
import { ownerNumbers } from "./owner-assistant.service.js";
import { deleteMedia } from "./wa-media.js";
import { WaOutboxService } from "./wa-outbox.service.js";

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
export const REMIND_BEFORE_MS = 2 * 3600 * 1000;

/** WA_TASK_DIGEST_TIME "HH:MM" IST (default 09:00) → [h, m]. */
export function digestTime(env = process.env.WA_TASK_DIGEST_TIME): [number, number] {
  const m = (env ?? "").match(/^(\d{1,2}):(\d{2})$/);
  const h = m ? Number(m[1]) : 9;
  const min = m ? Number(m[2]) : 0;
  return h < 24 && min < 60 ? [h, min] : [9, 0];
}

/** Whether the morning list is due now and hasn't gone today (IST). */
export function digestDue(now: Date, lastRunAt: Date | null, at = digestTime()): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (mins < at[0] * 60 + at[1]) return false;
  return !lastRunAt || lastRunAt < istDayStart(now);
}

/**
 * Once a minute: the owner's morning task list (WA_TASK_DIGEST_TIME, IST),
 * reminders 2 hours before a task is due, and deletion of stored voice notes
 * that are due (7 days). Logs counts and task numbers only.
 */
/** "05/10/2026" (IST). */
const istDdMmYyyy = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join("/");

@Injectable()
export class TaskJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("TaskJobs");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly outbox: WaOutboxService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId) return;
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(`tick failed: ${e?.name ?? "error"}`)), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    await this.digest(now);
    await this.reminders(now);
    await this.purgeMedia(now);
  }

  async digest(now: Date): Promise<boolean> {
    const run = await this.prisma.waJobRun.findUnique({ where: { name: "task-digest" } });
    if (!digestDue(now, run?.lastRunAt ?? null)) return false;
    await this.prisma.waJobRun.upsert({ where: { name: "task-digest" }, create: { name: "task-digest", lastRunAt: now }, update: { lastRunAt: now } });
    const open = await this.tasks.openTasks(this.orgId);
    const names = await this.tasks.userNames(open.map((t) => t.assigneeId));
    const text = digestText(
      open.map((t) => ({ number: t.number, title: t.title, dueAt: t.dueAt, assigneeName: t.assigneeId ? names.get(t.assigneeId) : null })),
      now,
    );
    if (!text) return false;
    const today = istDayStart(now);
    const overdue = open.filter((t) => t.dueAt && t.dueAt < today).length;
    const dueToday = open.filter((t) => t.dueAt && t.dueAt >= today && t.dueAt.getTime() < today.getTime() + 864e5).length;
    for (const o of ownerNumbers()) {
      await this.outbox.deliverDirect(o, text, {
        name: WA_TEMPLATES.ownerDigest.name,
        language: WA_TEMPLATES.ownerDigest.language,
        params: [istDdMmYyyy(now), String(dueToday), String(overdue)],
      });
    }
    this.log.log(`morning list sent: today=${dueToday} overdue=${overdue}`);
    return true;
  }

  async reminders(now: Date): Promise<number> {
    const due = await this.prisma.task.findMany({
      where: { organizationId: this.orgId, status: "OPEN", remindedAt: null, dueAt: { gt: now, lte: new Date(now.getTime() + REMIND_BEFORE_MS) } },
      take: 50,
    });
    for (const t of due) {
      const text = `⏰ याद दिलाना: काम #${t.number} — ${t.title}\nसमय: ${formatDueHi(t.dueAt!.toISOString())}\nपूरा होने पर "${t.number} हो गया" लिखें।`;
      for (const o of ownerNumbers()) await this.outbox.deliverDirect(o, text, null);
      await this.prisma.task.update({ where: { id: t.id }, data: { remindedAt: now } });
      this.log.log(`reminder for task #${t.number}`);
    }
    return due.length;
  }

  async purgeMedia(now: Date): Promise<number> {
    const due = await this.prisma.waMediaDeletion.findMany({ where: { deleteAt: { lte: now } }, take: 100 });
    let n = 0;
    for (const d of due) {
      try {
        await deleteMedia(d.key);
        await this.prisma.waMediaDeletion.delete({ where: { key: d.key } });
        n++;
      } catch {
        /* retried next minute */
      }
    }
    if (n) this.log.log(`${n} stored voice note(s) deleted (7 days)`);
    return n;
  }
}
