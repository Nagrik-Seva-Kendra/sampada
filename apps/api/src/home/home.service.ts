import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { HomeCard, HomeSummary, SearchHit } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { addDay, istToday } from "../whatsapp/registry-date.js";
import { requestRef } from "../whatsapp/wa-requests.mapper.js";

const isManager = (role: string) => role === "OWNER" || role === "ADMIN";
const IST_MS = 5.5 * 3600 * 1000;

/** "%" / "_" are literal in a search. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The owner's home (today's numbers) and the global search. OWNER/ADMIN see
 * the whole office; other staff only what is assigned to them. Search queries
 * are never logged.
 */
@Injectable()
export class HomeService {
  private readonly log = new Logger("Home");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async summary(now = new Date()): Promise<HomeSummary> {
    const t = requireTenantContext(this.cls);
    const org = t.organizationId;
    const manage = isManager(t.role);
    const mine = manage ? {} : { assigneeId: t.userId };
    const today = istToday(now);
    const tomorrow = addDay(today, 1);
    const dayStart = new Date(Date.parse(`${today}T00:00:00Z`) - IST_MS);
    const dayEnd = new Date(dayStart.getTime() + 864e5);
    const user = await this.prisma.user.findFirst({ where: { id: t.userId }, select: { fname: true } });
    const safe = <T>(p: Promise<T>, d: T) => p.catch(() => d);
    const [waNew, callbacks, regToday, regTomorrow, tasksToday, followUps] = await Promise.all([
      safe(this.prisma.draftIntake.count({ where: { organizationId: org, status: "SUBMITTED", workStatus: "NEW", ...mine } }), 0),
      safe(this.prisma.callbackRequest.count({ where: { organizationId: org, status: "NEW", ...mine } }), 0),
      safe(this.prisma.draftIntake.count({ where: { organizationId: org, registryDate: today, ...mine } }), 0),
      safe(this.prisma.draftIntake.count({ where: { organizationId: org, registryDate: tomorrow, ...mine } }), 0),
      safe(this.prisma.task.count({ where: { organizationId: org, status: "OPEN", dueAt: { lt: dayEnd }, ...mine } }), 0),
      safe(this.prisma.followUp.count({ where: { organizationId: org, status: "PENDING", dueDate: { lte: addDay(today, 7) } } }), 0),
    ]);
    const cards: HomeCard[] = [
      { key: "waNew", value: waNew, to: "/whatsapp-requests", alert: waNew > 0 },
      { key: "callbacks", value: callbacks, to: "/calls", alert: callbacks > 0 },
      { key: "registryToday", value: regToday, to: "/whatsapp-requests", alert: regToday > 0 },
      { key: "registryTomorrow", value: regTomorrow, to: "/whatsapp-requests", alert: false },
      { key: "tasksToday", value: tasksToday, to: "/tasks", alert: tasksToday > 0 },
    ];
    if (manage) {
      const [leaves, present, staff, aiReview, colony, copies, low] = await Promise.all([
        safe(this.prisma.leaveRequest.count({ where: { organizationId: org, status: "PENDING" } }), 0),
        safe(this.prisma.attendanceRecord.count({ where: { organizationId: org, day: today, kind: "IN" } }), 0),
        safe(this.prisma.membership.count({ where: { organizationId: org, status: "ACTIVE", role: { not: "OWNER" } } }), 0),
        safe(this.prisma.deedTemplate.count({ where: { aiDraftStatus: "REVIEW_PENDING" } }), 0),
        safe(this.prisma.colonySale.count({ where: { organizationId: org, status: "DRAFT" } }), 0),
        safe(this.prisma.archiveCopyRequest.count({ where: { organizationId: org, status: "REQUESTED" } }), 0),
        safe(this.prisma.draftIntake.count({ where: { organizationId: org, rating: { lte: 3 }, ratingAt: { gte: new Date(now.getTime() - 30 * 864e5) } } }), 0),
      ]);
      cards.push(
        { key: "attendance", value: present, total: staff, to: "/attendance", alert: staff > 0 && present < staff },
        { key: "leavesPending", value: leaves, to: "/attendance", alert: leaves > 0 },
        { key: "followUps", value: followUps, to: "/calls", alert: false },
        { key: "aiReview", value: aiReview, to: "/ai-draft", alert: aiReview > 0 },
        { key: "colonyDrafts", value: colony, to: "/colony", alert: colony > 0 },
        { key: "copyRequests", value: copies, to: "/whatsapp-requests", alert: copies > 0 },
        { key: "lowRatings", value: low, to: "/whatsapp-requests", alert: low > 0 },
      );
    }
    return { name: user?.fname ?? "", canManage: manage, cards };
  }

  /**
   * Global search (≥ 2 characters): requests (number, customer, last digits of
   * the phone), deeds (title, trigram similarity so small spelling
   * differences still match), tasks, call-backs, colony plots ("E-47").
   */
  async search(raw: string): Promise<SearchHit[]> {
    const t = requireTenantContext(this.cls);
    const q = (raw ?? "").trim().slice(0, 60);
    if (q.length < 2) throw new BadRequestException("कम से कम 2 अक्षर लिखें।");
    const org = t.organizationId;
    const manage = isManager(t.role);
    const mine = manage ? {} : { assigneeId: t.userId };
    const like = { contains: q, mode: "insensitive" as const };
    const digits = q.replace(/\D/g, "");
    const hits: SearchHit[] = [];

    const reqs = await this.prisma.draftIntake.findMany({
      where: {
        organizationId: org,
        status: "SUBMITTED",
        ...mine,
        OR: [
          { customerName: like },
          ...(/^[a-z0-9]{4,6}$/i.test(q) ? [{ id: { endsWith: q.toLowerCase() } }] : []),
          ...(digits.length >= 4 ? [{ phone: { endsWith: digits } }] : []),
        ],
      },
      select: { id: true, customerName: true, phone: true, workStatus: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    for (const r of reqs) hits.push({ kind: "request", id: r.id, title: `${requestRef(r.id)} · ${r.customerName ?? "—"}`, subtitle: `****${r.phone.slice(-4)} · ${r.workStatus ?? ""}`, to: `/whatsapp-requests/${r.id}` });

    // Deeds: ILIKE (GIN trigram index) plus similarity ranking; plain ILIKE if pg_trgm is missing.
    let deeds: { id: string; title: string; type: string }[] = [];
    try {
      deeds = await this.prisma.$unscoped.$queryRaw<{ id: string; title: string; type: string }[]>`
        SELECT id, title, type FROM "DeedTemplate"
        WHERE "organizationId" = ${org} AND status = 'active'
          AND (title ILIKE ${"%" + likeEscape(q) + "%"} OR similarity(title, ${q}) > 0.3)
        ORDER BY similarity(title, ${q}) DESC, "updatedAt" DESC
        LIMIT 6`;
    } catch {
      deeds = await this.prisma.deedTemplate.findMany({ where: { title: like, status: "active" }, select: { id: true, title: true, type: true }, orderBy: { updatedAt: "desc" }, take: 6 });
    }
    for (const d of deeds) hits.push({ kind: "deed", id: d.id, title: d.title, subtitle: d.type, to: `/deeds/${d.type}/edit/${d.id}` });

    const tasks = await this.prisma.task.findMany({
      where: { organizationId: org, ...mine, OR: [{ title: like }, { partyName: like }, ...(/^\d{1,5}$/.test(q) ? [{ number: Number(q) }] : [])] },
      select: { id: true, number: true, title: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    });
    for (const x of tasks) hits.push({ kind: "task", id: x.id, title: `#${x.number} · ${x.title}`, subtitle: x.status, to: "/tasks" });

    const cbs = await this.prisma.callbackRequest.findMany({
      where: { organizationId: org, ...mine, OR: [{ customerName: like }, { purpose: like }, ...(digits.length >= 4 ? [{ phone: { endsWith: digits } }] : [])] },
      select: { id: true, number: true, customerName: true, purpose: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    });
    for (const c of cbs) hits.push({ kind: "callback", id: c.id, title: `#${c.number} · ${c.customerName ?? "—"}`, subtitle: c.purpose.slice(0, 60), to: "/calls" });

    const plot = q.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).match(/^([A-Za-z])\s*[-/ ]\s*(\d{1,4}[A-Za-z]?)$/);
    if (plot) {
      const plots = await this.prisma.colonyPlot.findMany({ where: { organizationId: org, block: plot[1]!.toUpperCase(), plotNo: plot[2]! }, select: { id: true, block: true, plotNo: true, status: true, projectId: true }, take: 4 });
      const projects = plots.length ? await this.prisma.colonyProject.findMany({ where: { id: { in: plots.map((p) => p.projectId) } }, select: { id: true, name: true } }) : [];
      for (const p of plots) hits.push({ kind: "plot", id: p.id, title: `${projects.find((x) => x.id === p.projectId)?.name ?? ""} ब्लॉक ${p.block} - प्लाट ${p.plotNo}`, subtitle: p.status, to: "/colony" });
    }
    this.log.log(`search: ${hits.length} hit(s)`);
    return hits;
  }
}
