import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { type CallbackItem, type CallbackList, type CallbackSource, WA_TEMPLATES } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { normalizePhone } from "../tasks/tasks.service.js";
import { ownerNumbers } from "./owner-assistant.service.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { requestRef } from "./wa-requests.mapper.js";
import { maskPhone } from "./webhook-diagnostics.js";
import { whenHi } from "./call-rules.js";

const isManager = (role: string) => role === "OWNER" || role === "ADMIN";

/**
 * Call-back requests: created from WhatsApp (menu 5 → "कॉल बैक चाहिए", or
 * "हाँ करवाना है" to a follow-up), listed on the web "कॉल बैक" tab. OWNER /
 * ADMIN see all and assign; other staff only those assigned to them (same
 * rule as WhatsApp requests). The owner and the assignee get a WhatsApp alert.
 * Logs carry numbers of call-backs and masked phones only.
 */
@Injectable()
export class CallbackService {
  private readonly log = new Logger("Callbacks");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly outbox: WaOutboxService,
  ) {}

  /** From the bot: assigned to whoever handles the customer's latest request (if any). */
  async create(input: {
    phone: string;
    customerName?: string | null;
    preferredAt: Date | null;
    preferredText: string | null;
    purpose: string;
    source: CallbackSource;
  }): Promise<{ number: number }> {
    const organizationId = this.orgId;
    const req = await this.prisma.draftIntake.findFirst({
      where: { organizationId, phone: input.phone, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, assigneeId: true, customerName: true },
    });
    let row: any = null;
    for (let i = 0; i < 5 && !row; i++) {
      const last = await this.prisma.callbackRequest.findFirst({ where: { organizationId }, orderBy: { number: "desc" }, select: { number: true } });
      try {
        row = await this.prisma.callbackRequest.create({
          data: {
            organizationId,
            number: (last?.number ?? 0) + 1,
            phone: input.phone,
            customerName: input.customerName ?? req?.customerName ?? null,
            preferredAt: input.preferredAt,
            preferredText: input.preferredText?.slice(0, 200) ?? null,
            purpose: input.purpose.slice(0, 500),
            source: input.source,
            assigneeId: req?.assigneeId ?? null,
            draftIntakeId: req?.id ?? null,
          },
        });
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
      }
    }
    this.log.log(`call-back #${row.number} from ${maskPhone(input.phone)} (${input.source})`);
    await this.alert(row);
    return { number: row.number };
  }

  private async alert(row: any): Promise<void> {
    const when = row.preferredAt ? whenHi(row.preferredAt, new Date()) : "जल्द से जल्द";
    const text = `📞 कॉल बैक #${row.number}: ${row.customerName ?? "ग्राहक"} (+${row.phone}) — ${when}। काम: ${row.purpose}`;
    const to = new Set(ownerNumbers());
    if (row.assigneeId) {
      const u = await this.prisma.user.findFirst({ where: { id: row.assigneeId }, select: { mobile: true } });
      const p = normalizePhone(u?.mobile);
      if (p) to.add(p);
    }
    for (const n of to) {
      await this.outbox
        .deliverDirect(n, text, {
          name: WA_TEMPLATES.staffNotice.name,
          language: WA_TEMPLATES.staffNotice.language,
          params: ["जी", `कॉल बैक #${row.number}`, `${row.customerName ?? "ग्राहक"} (+${row.phone}), ${when}, काम: ${String(row.purpose).replace(/\s+/g, " ").slice(0, 150)}`],
        })
        .catch(() => undefined);
    }
  }

  // ---------- web ----------
  async list(): Promise<CallbackList> {
    const t = requireTenantContext(this.cls);
    const manage = isManager(t.role);
    const where = { organizationId: t.organizationId, ...(manage ? {} : { assigneeId: t.userId }) };
    const rows = await this.prisma.callbackRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 });
    const names = await this.names(rows.flatMap((r) => [r.assigneeId, r.doneById]));
    const items = rows.map((r) => this.item(r, names));
    // NEW first, by the time the customer wants (soonest first, "as soon as possible" first); then DONE, latest first.
    const key = (c: CallbackItem) => c.preferredAt ?? c.createdAt;
    items.sort((a, b) =>
      a.status !== b.status ? (a.status === "NEW" ? -1 : 1) : a.status === "NEW" ? key(a).localeCompare(key(b)) : (b.doneAt ?? "").localeCompare(a.doneAt ?? ""),
    );
    return { data: items, newCount: items.filter((c) => c.status === "NEW").length, canManage: manage };
  }

  async count(): Promise<number> {
    const t = requireTenantContext(this.cls);
    return this.prisma.callbackRequest.count({
      where: { organizationId: t.organizationId, status: "NEW", ...(isManager(t.role) ? {} : { assigneeId: t.userId }) },
    });
  }

  async done(id: string, note: string | null): Promise<CallbackItem> {
    const t = requireTenantContext(this.cls);
    const row = await this.find(id, t);
    await this.prisma.callbackRequest.update({
      where: { id: row.id },
      data: { status: "DONE", doneNote: note?.trim() || null, doneAt: new Date(), doneById: t.userId },
    });
    this.log.log(`call-back #${row.number} done`);
    return this.one(row.id);
  }

  async reopen(id: string): Promise<CallbackItem> {
    const t = requireTenantContext(this.cls);
    const row = await this.find(id, t);
    await this.prisma.callbackRequest.update({ where: { id: row.id }, data: { status: "NEW", doneAt: null, doneById: null } });
    return this.one(row.id);
  }

  async assign(id: string, assigneeId: string | null): Promise<CallbackItem> {
    const t = requireTenantContext(this.cls);
    if (!isManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन कॉल बैक सौंप सकते हैं।");
    const row = await this.find(id, t);
    if (assigneeId) {
      const m = await this.prisma.membership.findFirst({ where: { organizationId: t.organizationId, userId: assigneeId, status: "ACTIVE" }, select: { id: true } });
      if (!m) throw new BadRequestException("यह व्यक्ति इस संस्था का सक्रिय सदस्य नहीं है।");
    }
    await this.prisma.callbackRequest.update({ where: { id: row.id }, data: { assigneeId } });
    const updated = await this.prisma.callbackRequest.findFirst({ where: { id: row.id } });
    if (assigneeId && assigneeId !== row.assigneeId) await this.alert(updated);
    return this.one(row.id);
  }

  private async find(id: string, t: { organizationId: string; userId: string; role: string }) {
    const row = await this.prisma.callbackRequest.findFirst({
      where: { id, organizationId: t.organizationId, ...(isManager(t.role) ? {} : { assigneeId: t.userId }) },
    });
    if (!row) throw new NotFoundException("कॉल बैक नहीं मिला।");
    return row;
  }

  private async one(id: string): Promise<CallbackItem> {
    const r = await this.prisma.callbackRequest.findFirst({ where: { id } });
    return this.item(r, await this.names([r!.assigneeId, r!.doneById]));
  }

  private item(r: any, names: Map<string, string>): CallbackItem {
    return {
      id: r.id,
      number: r.number,
      phone: r.phone,
      customerName: r.customerName,
      preferredAt: r.preferredAt?.toISOString() ?? null,
      preferredText: r.preferredText,
      purpose: r.purpose,
      status: r.status === "DONE" ? "DONE" : "NEW",
      source: r.source === "followup" ? "followup" : "whatsapp",
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeId ? (names.get(r.assigneeId) ?? null) : null,
      requestId: r.draftIntakeId,
      requestRef: r.draftIntakeId ? requestRef(r.draftIntakeId) : null,
      doneNote: r.doneNote,
      doneAt: r.doneAt?.toISOString() ?? null,
      doneByName: r.doneById ? (names.get(r.doneById) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, fname: true, lname: true } });
    return new Map(users.map((u) => [u.id, `${u.fname} ${u.lname}`.trim()]));
  }
}
