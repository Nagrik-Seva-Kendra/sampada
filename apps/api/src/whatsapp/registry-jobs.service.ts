import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { WA_TEMPLATES } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { addDay, istToday } from "./registry-date.js";
import { geoTagReminderLine, registryReminderText, registryWhenHi } from "./registry-flow.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { requestRef } from "./wa-requests.mapper.js";

/** WA_REGISTRY_REMINDER_TIME "HH:MM" IST (default 10:00) → minutes. */
export function reminderMinutes(env = process.env.WA_REGISTRY_REMINDER_TIME): number {
  const m = (env ?? "").match(/^(\d{1,2}):(\d{2})$/);
  const h = m ? Number(m[1]) : 10;
  const min = m ? Number(m[2]) : 0;
  return h < 24 && min < 60 ? h * 60 + min : 600;
}

/** Due between the reminder time and 20:00 IST (a late restart still reminds the same evening). */
export function reminderDue(now: Date, at = reminderMinutes()): boolean {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= at && mins < Math.max(at + 60, 20 * 60);
}

/**
 * Once a minute: the day-before registry reminder to the customer (confirmed
 * date tomorrow), once per request -- the claim on registryReminderSentAt
 * makes it safe with several instances. Logs request numbers only.
 */
@Injectable()
export class RegistryJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("RegistryJobs");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: WaOutboxService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId) return;
    this.timer = setInterval(() => this.reminders().catch((e) => this.log.error(`reminders failed: ${e?.name ?? "error"}`)), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async reminders(now = new Date()): Promise<number> {
    if (!reminderDue(now)) return 0;
    const tomorrow = addDay(istToday(now), 1);
    const rows = await this.prisma.draftIntake.findMany({
      where: {
        organizationId: this.orgId,
        status: "SUBMITTED",
        registryDate: tomorrow,
        registryReminderSentAt: null,
        workStatus: { notIn: ["REJECTED"] },
      },
      select: { id: true, organizationId: true, phone: true, registryDate: true, registryTime: true, geoTagMode: true },
      take: 200,
    });
    let sent = 0;
    for (const r of rows) {
      const claim = await this.prisma.draftIntake.updateMany({ where: { id: r.id, registryReminderSentAt: null }, data: { registryReminderSentAt: now } });
      if (!claim.count) continue;
      const ref = requestRef(r.id);
      await this.outbox
        .send({
          organizationId: r.organizationId,
          draftIntakeId: r.id,
          kind: "REGISTRY",
          to: r.phone,
          text: registryReminderText(ref, r.registryDate!, r.registryTime, r.geoTagMode),
          template: {
            name: WA_TEMPLATES.registryReminder.name,
            language: WA_TEMPLATES.registryReminder.language,
            params: [ref, registryWhenHi(r.registryDate!, r.registryTime), geoTagReminderLine(r.geoTagMode)],
          },
        })
        .catch((e) => this.log.error(`registry reminder for request ${ref} not recorded: ${e?.code ?? e?.name ?? "error"}`));
      this.log.log(`registry reminder sent for request ${ref}`);
      sent++;
    }
    return sent;
  }
}
