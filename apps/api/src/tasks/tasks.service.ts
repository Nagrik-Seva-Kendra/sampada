import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import {
  type TaskCreateInput,
  type TaskItem,
  type TaskList,
  type TaskSource,
  type TaskStatus,
  type TaskUpdateInput,
  type TaskWorkType,
} from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";

export const isTaskManager = (role: string) => role === "OWNER" || role === "ADMIN";

type Row = {
  id: string;
  number: number;
  title: string;
  partyName: string | null;
  partyPhone: string | null;
  workType: string;
  place: string | null;
  dueAt: Date | null;
  note: string | null;
  source: string;
  transcript: string | null;
  status: string;
  assigneeId: string | null;
  linkedRequestId: string | null;
  createdAt: Date;
  doneAt: Date | null;
};

export function toTaskItem(r: Row, assigneeName: string | null): TaskItem {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    partyName: r.partyName,
    partyPhone: r.partyPhone,
    workType: r.workType as TaskWorkType,
    place: r.place,
    dueAt: r.dueAt?.toISOString() ?? null,
    note: r.note,
    source: r.source as TaskSource,
    transcript: r.transcript,
    status: r.status as TaskStatus,
    assigneeId: r.assigneeId,
    assigneeName,
    linkedRequestId: r.linkedRequestId,
    createdAt: r.createdAt.toISOString(),
    doneAt: r.doneAt?.toISOString() ?? null,
  };
}

export interface NewTask {
  title: string;
  partyName?: string | null;
  partyPhone?: string | null;
  workType?: TaskWorkType;
  place?: string | null;
  dueAt?: Date | null;
  note?: string | null;
  source: TaskSource;
  transcript?: string | null;
  assigneeId?: string | null;
  createdById?: string | null;
  broadcastId?: string | null;
}

/**
 * Office to-do items. Task is not a tenant-scoped model, so every query filters
 * by organizationId explicitly. Web: OWNER/ADMIN see and assign everything;
 * other staff only tasks assigned to them. The WhatsApp side (owner assistant)
 * calls the org-explicit methods.
 */
@Injectable()
export class TasksService {
  private readonly log = new Logger("Tasks");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ---------- web ----------
  async list(filters: { status?: TaskStatus; assigneeId?: string }): Promise<TaskList> {
    const t = requireTenantContext(this.cls);
    const canManage = isTaskManager(t.role);
    const rows = await this.prisma.task.findMany({
      where: {
        organizationId: t.organizationId,
        ...(canManage ? (filters.assigneeId ? { assigneeId: filters.assigneeId } : {}) : { assigneeId: t.userId }),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { number: "desc" }],
      take: 500,
    });
    const names = await this.userNames(rows.map((r) => r.assigneeId));
    return { data: rows.map((r) => toTaskItem(r, r.assigneeId ? (names.get(r.assigneeId) ?? null) : null)), canManage };
  }

  async createWeb(input: TaskCreateInput): Promise<TaskItem> {
    const t = requireTenantContext(this.cls);
    const canManage = isTaskManager(t.role);
    // Staff may note a task for themselves; only managers give work to others.
    const assigneeId = canManage ? (input.assigneeId ?? null) : t.userId;
    if (assigneeId) await this.assertMember(t.organizationId, assigneeId);
    const row = await this.create(t.organizationId, {
      ...input,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      partyPhone: normalizePhone(input.partyPhone),
      source: "web",
      assigneeId,
      createdById: t.userId,
    });
    return this.item(row);
  }

  async updateWeb(id: string, input: TaskUpdateInput): Promise<TaskItem> {
    const t = requireTenantContext(this.cls);
    const canManage = isTaskManager(t.role);
    const row = await this.prisma.task.findFirst({ where: { id, organizationId: t.organizationId, ...(canManage ? {} : { assigneeId: t.userId }) } });
    if (!row) throw new NotFoundException("काम नहीं मिला।");
    if (input.assigneeId !== undefined && !canManage) throw new ForbiddenException("केवल मालिक या एडमिन काम सौंप सकते हैं।");
    if (input.assigneeId) await this.assertMember(t.organizationId, input.assigneeId);
    const updated = await this.prisma.task.update({
      where: { id: row.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.partyName !== undefined ? { partyName: input.partyName } : {}),
        ...(input.partyPhone !== undefined ? { partyPhone: normalizePhone(input.partyPhone) } : {}),
        ...(input.workType !== undefined ? { workType: input.workType } : {}),
        ...(input.place !== undefined ? { place: input.place } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null, remindedAt: null } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.status !== undefined ? { status: input.status, doneAt: input.status === "DONE" ? new Date() : null } : {}),
      },
    });
    return this.item(updated);
  }

  // ---------- org-explicit (WhatsApp assistant, jobs) ----------
  async create(organizationId: string, t: NewTask): Promise<Row> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await this.prisma.task.findFirst({ where: { organizationId }, orderBy: { number: "desc" }, select: { number: true } });
      try {
        const row = await this.prisma.task.create({
          data: {
            organizationId,
            number: (last?.number ?? 0) + 1,
            title: t.title,
            partyName: t.partyName ?? null,
            partyPhone: t.partyPhone ?? null,
            workType: t.workType ?? "other",
            place: t.place ?? null,
            dueAt: t.dueAt ?? null,
            note: t.note ?? null,
            source: t.source,
            transcript: t.transcript ?? null,
            assigneeId: t.assigneeId ?? null,
            createdById: t.createdById ?? null,
            broadcastId: t.broadcastId ?? null,
          },
        });
        this.log.log(`task #${row.number} created (source=${t.source})`);
        return row;
      } catch (e: any) {
        if (e?.code !== "P2002") throw e; // number taken by a parallel create → next one
      }
    }
    throw new BadRequestException("काम नहीं बन सका, कृपया दोबारा कोशिश करें।");
  }

  findByNumber(organizationId: string, number: number) {
    return this.prisma.task.findFirst({ where: { organizationId, number } });
  }

  setStatus(id: string, status: TaskStatus) {
    return this.prisma.task.update({ where: { id }, data: { status, doneAt: status === "DONE" ? new Date() : null } });
  }

  setDue(id: string, dueAt: Date) {
    return this.prisma.task.update({ where: { id }, data: { dueAt, remindedAt: null } });
  }

  openTasks(organizationId: string) {
    return this.prisma.task.findMany({ where: { organizationId, status: "OPEN" }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { number: "asc" }], take: 200 });
  }

  async item(row: Row): Promise<TaskItem> {
    const names = await this.userNames([row.assigneeId]);
    return toTaskItem(row, row.assigneeId ? (names.get(row.assigneeId) ?? null) : null);
  }

  async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, fname: true, lname: true } });
    return new Map(users.map((u) => [u.id, `${u.fname} ${u.lname}`.trim()]));
  }

  private async assertMember(organizationId: string, userId: string) {
    const m = await this.prisma.membership.findFirst({ where: { organizationId, userId, status: "ACTIVE" }, select: { id: true } });
    if (!m) throw new BadRequestException("यह व्यक्ति इस संस्था का सक्रिय सदस्य नहीं है।");
  }
}

/** "98765 43210" / "+91 98765-43210" → "919876543210"; anything else → null. */
export function normalizePhone(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d;
  return /^[6-9]\d{9}$/.test(ten) ? `91${ten}` : null;
}
