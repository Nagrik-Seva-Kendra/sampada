import { ForbiddenException, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import {
  DEFAULT_FOLLOW_UP_RULES,
  type FollowUpItem,
  type FollowUpKind,
  type FollowUpList,
  type FollowUpRule,
  FollowUpRuleInput,
  WA_TEMPLATES,
} from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { CallbackService } from "./callback.service.js";
import { effectiveKind, FOLLOW_UP_LABEL_HI, followUpDue, followUpText, STOP_RE, WANT_RE } from "./call-rules.js";
import { addDay, istToday } from "./registry-date.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { requestRef } from "./wa-requests.mapper.js";
import { maskPhone } from "./webhook-diagnostics.js";

const isManager = (role: string) => role === "OWNER" || role === "ADMIN";
const REPLY_WINDOW_DAYS = 60;

/** WA_FOLLOWUP_TIME "HH:MM" IST (default 11:00); sends until 19:00. */
export function followUpDueNow(now: Date, env = process.env.WA_FOLLOWUP_TIME): boolean {
  const m = (env ?? "").match(/^(\d{1,2}):(\d{2})$/);
  const at = m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : 660;
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= at && mins < Math.max(at + 60, 19 * 60);
}

/**
 * Follow-up reminders after a registry is DONE (rules per kind, owner-editable):
 * scheduled when a request becomes DONE (or its follow-up kind / term end
 * changes), sent by a daily job (text inside the 24h window, else the
 * follow_up_reminder template). "बंद" / STOP opts the number out of all
 * follow-ups; "हाँ करवाना है" creates a call-back for the office.
 */
@Injectable()
export class FollowUpService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("FollowUps");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly outbox: WaOutboxService,
    private readonly callbacks: CallbackService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId) return;
    this.timer = setInterval(() => this.send().catch((e) => this.log.error(`send failed: ${e?.name ?? "error"}`)), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  // ---------- rules ----------
  async rules(organizationId: string): Promise<FollowUpRule[]> {
    const rows = await this.prisma.followUpRule.findMany({ where: { organizationId } });
    return DEFAULT_FOLLOW_UP_RULES.map((d) => {
      const r = rows.find((x) => x.kind === d.kind);
      const parsed = r ? FollowUpRuleInput.safeParse({ kind: r.kind, enabled: r.enabled, offsetDays: r.offsetDays, text: r.text }) : null;
      return parsed?.success ? parsed.data : d;
    });
  }

  async saveRules(rules: FollowUpRule[]): Promise<FollowUpList> {
    const t = requireTenantContext(this.cls);
    if (!isManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन नियम बदल सकते हैं।");
    for (const r of rules) {
      await this.prisma.followUpRule.upsert({
        where: { organizationId_kind: { organizationId: t.organizationId, kind: r.kind } },
        create: { organizationId: t.organizationId, ...r },
        update: { enabled: r.enabled, offsetDays: r.offsetDays, text: r.text },
      });
    }
    this.log.log(`rules updated (${rules.length})`);
    return this.list();
  }

  // ---------- web list ----------
  async list(): Promise<FollowUpList> {
    const t = requireTenantContext(this.cls);
    const manage = isManager(t.role);
    let ids: string[] | null = null;
    if (!manage) {
      const mine = await this.prisma.draftIntake.findMany({ where: { organizationId: t.organizationId, assigneeId: t.userId }, select: { id: true } });
      ids = mine.map((m) => m.id);
    }
    const rows = await this.prisma.followUp.findMany({
      where: { organizationId: t.organizationId, ...(ids ? { draftIntakeId: { in: ids } } : {}) },
      orderBy: { dueDate: "asc" },
      take: 500,
    });
    return { rules: await this.rules(t.organizationId), data: await this.items(rows), canManage: manage };
  }

  async forRequest(draftIntakeId: string): Promise<FollowUpItem[]> {
    const rows = await this.prisma.followUp.findMany({ where: { draftIntakeId }, orderBy: { dueDate: "asc" } });
    return this.items(rows);
  }

  private async items(rows: any[]): Promise<FollowUpItem[]> {
    const reqIds = [...new Set(rows.map((r) => r.draftIntakeId))];
    const reqs = reqIds.length
      ? await this.prisma.draftIntake.findMany({ where: { id: { in: reqIds } }, select: { id: true, customerName: true } })
      : [];
    const names = new Map(reqs.map((r) => [r.id, r.customerName]));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as FollowUpKind,
      dueDate: r.dueDate,
      status: r.status,
      recurring: r.recurring,
      requestId: r.draftIntakeId,
      requestRef: requestRef(r.draftIntakeId),
      customerName: names.get(r.draftIntakeId) ?? null,
      phoneMasked: maskPhone(r.phone),
      sentAt: r.sentAt?.toISOString() ?? null,
      repliedAt: r.repliedAt?.toISOString() ?? null,
    }));
  }

  // ---------- scheduling ----------
  /**
   * (Re)plans the request's follow-up: called when it becomes DONE and when its
   * kind / term end change while DONE. Earlier PENDING ones are cancelled.
   */
  async scheduleFor(row: {
    id: string;
    organizationId: string;
    phone: string;
    workStatus: string | null;
    data: unknown;
    followUpKind?: string | null;
    termEndDate?: string | null;
    registryDate?: string | null;
    closedAt?: Date | null;
  }, now = new Date()): Promise<void> {
    await this.prisma.followUp.updateMany({ where: { draftIntakeId: row.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (row.workStatus !== "DONE") return;
    const deedType = (row.data as any)?.deedType as string | undefined;
    const kind = effectiveKind(deedType, row.followUpKind);
    if (!kind) return;
    const contact = await this.prisma.waContact.findUnique({ where: { phone: row.phone }, select: { followUpOptOutAt: true } });
    if (contact?.followUpOptOutAt) return;
    const rule = (await this.rules(row.organizationId)).find((r) => r.kind === kind)!;
    const today = istToday(now);
    const due = followUpDue(kind, rule, { today, registryDay: row.registryDate ?? istToday(row.closedAt ?? now), termEnd: row.termEndDate ?? null });
    if (!due) return;
    await this.prisma.followUp.create({
      data: { organizationId: row.organizationId, draftIntakeId: row.id, phone: row.phone, kind, dueDate: due.dueDate, recurring: due.recurring },
    });
    this.log.log(`follow-up ${kind} planned for request ${requestRef(row.id)} on ${due.dueDate}`);
  }

  // ---------- daily job ----------
  async send(now = new Date()): Promise<number> {
    if (!followUpDueNow(now)) return 0;
    const today = istToday(now);
    const due = await this.prisma.followUp.findMany({
      where: { organizationId: this.orgId, status: "PENDING", dueDate: { lte: today } },
      orderBy: { dueDate: "asc" },
      take: 100,
    });
    if (!due.length) return 0;
    const rules = await this.rules(this.orgId);
    let sent = 0;
    for (const f of due) {
      const claim = await this.prisma.followUp.updateMany({ where: { id: f.id, status: "PENDING" }, data: { status: "SENT", sentAt: now } });
      if (!claim.count) continue;
      const contact = await this.prisma.waContact.findUnique({ where: { phone: f.phone }, select: { followUpOptOutAt: true } });
      const req = await this.prisma.draftIntake.findFirst({
        where: { id: f.draftIntakeId },
        select: { id: true, customerName: true, registryDate: true, termEndDate: true, workStatus: true, closedAt: true },
      });
      const rule = rules.find((r) => r.kind === f.kind);
      if (contact?.followUpOptOutAt || !req || !rule?.enabled) {
        await this.prisma.followUp.update({ where: { id: f.id }, data: { status: contact?.followUpOptOutAt ? "OPTED_OUT" : "CANCELLED", sentAt: null } });
        continue;
      }
      const ref = requestRef(req.id);
      const date = f.kind === "sale" ? (req.registryDate ?? istToday(req.closedAt ?? now)) : (req.termEndDate ?? f.dueDate);
      const body = followUpText(rule, { name: req.customerName, ref, date });
      await this.outbox
        .send({
          organizationId: f.organizationId,
          draftIntakeId: f.draftIntakeId,
          kind: "FOLLOWUP",
          to: f.phone,
          text: `${body}\n(ऐसे संदेश बंद करने के लिए "बंद" लिखें।)`,
          template: { name: WA_TEMPLATES.followUp.name, language: WA_TEMPLATES.followUp.language, params: [body] },
        })
        .catch((e) => this.log.error(`follow-up for request ${ref} not recorded: ${e?.code ?? e?.name ?? "error"}`));
      if (f.recurring) {
        await this.prisma.followUp.create({
          data: { organizationId: f.organizationId, draftIntakeId: f.draftIntakeId, phone: f.phone, kind: f.kind, dueDate: addDay(f.dueDate, 365), recurring: true },
        });
      }
      this.log.log(`follow-up ${f.kind} sent for request ${ref}`);
      sent++;
    }
    return sent;
  }

  // ---------- customer replies ----------
  /** "बंद" / STOP, or "हाँ करवाना है" after a follow-up; null when the text is neither (or nothing was sent). */
  async reply(phone: string, text: string, now = new Date()): Promise<string[] | null> {
    const t = text.trim();
    if (STOP_RE.test(t)) {
      const any = await this.prisma.followUp.count({ where: { phone, status: { in: ["PENDING", "SENT"] } } });
      if (!any) return null;
      await this.prisma.waContact.upsert({
        where: { phone },
        create: { phone, lastInboundAt: now, followUpOptOutAt: now },
        update: { followUpOptOutAt: now },
      });
      await this.prisma.followUp.updateMany({ where: { phone, status: "PENDING" }, data: { status: "OPTED_OUT" } });
      this.log.log(`follow-ups stopped for ${maskPhone(phone)}`);
      return ["ठीक है, अब आपको याद दिलाने वाले संदेश नहीं भेजे जाएँगे। कभी भी मदद के लिए \"नमस्ते\" लिखें।"];
    }
    if (!WANT_RE.test(t)) return null;
    const since = new Date(now.getTime() - REPLY_WINDOW_DAYS * 864e5);
    const f = await this.prisma.followUp.findFirst({ where: { phone, status: "SENT", sentAt: { gte: since } }, orderBy: { sentAt: "desc" } });
    if (!f) return null;
    await this.prisma.followUp.update({ where: { id: f.id }, data: { status: "YES", repliedAt: now } });
    const label = FOLLOW_UP_LABEL_HI[f.kind as FollowUpKind] ?? "काम";
    const cb = await this.callbacks.create({
      phone,
      preferredAt: null,
      preferredText: null,
      purpose: `${label} — फ़ॉलो-अप का जवाब (अनुरोध ${requestRef(f.draftIntakeId)})`,
      source: "followup",
    });
    this.log.log(`follow-up ${f.kind}: customer wants it (call-back #${cb.number})`);
    return [`✅ धन्यवाद! ${label} के लिए हमारा स्टाफ जल्द आपको कॉल करेगा।\nज़रूरी कागज़ (पुरानी रजिस्ट्री आदि) की PDF या फ़ोटो इसी नंबर पर भेज सकते हैं।`];
  }

  async optedOut(phone: string): Promise<boolean> {
    return !!(await this.prisma.waContact.findUnique({ where: { phone }, select: { followUpOptOutAt: true } }))?.followUpOptOutAt;
  }
}
