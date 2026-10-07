import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import {
  type AttendanceMonth,
  type AttendanceSettings,
  AttendanceSettingsInput,
  DEFAULT_ATTENDANCE_SETTINGS,
  type Holiday,
  type HolidayInput,
  type LeaveApplyInput,
  type LeaveRequestItem,
  type LeaveStatus,
  type LeaveType,
  type MyAttendanceToday,
  type OfficeNetwork,
  type PunchInput,
  type PunchRecord,
  type PunchResult,
  type StaffDay,
  WA_TEMPLATES,
} from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { WaOutboxService } from "../whatsapp/wa-outbox.service.js";
import { alertNumbers } from "../whatsapp/wa-alerts.js";
import { isPrivateIp, sameNetwork } from "../common/client-ip.js";
import { closedDay, dayStatus, istDay, monthDays, punchDecision } from "./attendance-rules.js";

/** Office internet addresses, kept in AttendanceConfig.config.officeNet (outside the settings form). */
type OfficeNet = { ip: string; addedAt: string; addedById: string | null };
const MAX_OFFICE_NETS = 10;

export const isAttendanceManager = (role: string) => role === "OWNER" || role === "ADMIN";
const TYPE_HI: Record<LeaveType, string> = { CASUAL: "आकस्मिक", SICK: "बीमारी", OTHER: "अन्य" };

/** WA_OWNER_NUMBERS (default WA_ALERT_NUMBERS). */
const owners = () => alertNumbers(process.env.WA_OWNER_NUMBERS || process.env.WA_ALERT_NUMBERS);
const phoneOf = (mobile: string | null | undefined) => {
  const d = (mobile ?? "").replace(/\D/g, "");
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d;
  return /^[6-9]\d{9}$/.test(ten) ? `91${ten}` : null;
};
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtTime = (d: Date) => d.toLocaleTimeString("hi-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

type Rec = { id: string; userId: string; day: string; kind: string; at: Date; inside: boolean; distanceM: number | null; reason: string | null };
const toPunch = (r: Rec): PunchRecord => ({
  id: r.id,
  userId: r.userId,
  day: r.day,
  kind: r.kind as PunchRecord["kind"],
  at: r.at.toISOString(),
  inside: r.inside,
  distanceM: r.distanceM,
  reason: r.reason,
});

/**
 * Staff attendance and leave. Every member marks their own attendance with a
 * GPS reading taken only when they press the button (no tracking). OWNER/ADMIN
 * see everyone, set the rules and decide leave; others see only their own.
 * Location coordinates are never logged.
 */
@Injectable()
export class AttendanceService {
  private readonly log = new Logger("Attendance");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly outbox: WaOutboxService,
  ) {}

  // ---------- settings ----------
  async settings(organizationId: string): Promise<AttendanceSettings> {
    const row = await this.prisma.attendanceConfig.findUnique({ where: { organizationId } });
    const { officeNet: _nets, ...config } = ((row?.config as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const parsed = AttendanceSettingsInput.safeParse({ ...DEFAULT_ATTENDANCE_SETTINGS, ...config });
    return parsed.success ? parsed.data : DEFAULT_ATTENDANCE_SETTINGS;
  }

  private async officeNets(organizationId: string): Promise<OfficeNet[]> {
    const row = await this.prisma.attendanceConfig.findUnique({ where: { organizationId } });
    const list = (row?.config as { officeNet?: unknown } | null)?.officeNet;
    return Array.isArray(list) ? list.filter((n): n is OfficeNet => !!n && typeof (n as OfficeNet).ip === "string") : [];
  }

  /** Is this address one of the office's internet connections? */
  async onOfficeNetwork(organizationId: string, ip: string | null | undefined): Promise<boolean> {
    if (!ip) return false;
    return (await this.officeNets(organizationId)).some((n) => sameNetwork(n.ip, ip));
  }

  private async writeNets(organizationId: string, userId: string, nets: OfficeNet[]) {
    const row = await this.prisma.attendanceConfig.findUnique({ where: { organizationId } });
    const config = { ...((row?.config as object) ?? DEFAULT_ATTENDANCE_SETTINGS), officeNet: nets };
    await this.prisma.attendanceConfig.upsert({
      where: { organizationId },
      create: { organizationId, config, updatedById: userId },
      update: { config, updatedById: userId },
    });
  }

  // ---------- office internet (computers without GPS) ----------
  async officeNetwork(ip: string | null): Promise<OfficeNetwork> {
    const t = this.manager();
    const nets = await this.officeNets(t.organizationId);
    return {
      yourIp: ip,
      yourIpMatches: !!ip && nets.some((n) => sameNetwork(n.ip, ip)),
      networks: nets.map((n) => ({ ip: n.ip, addedAt: n.addedAt })),
    };
  }

  /** OWNER/ADMIN, pressed in the office: this request's address becomes an office network. */
  async addOfficeNetwork(ip: string | null): Promise<OfficeNetwork> {
    const t = this.manager();
    if (!ip) throw new BadRequestException("इस कनेक्शन का पता नहीं मिला।");
    if (isPrivateIp(ip)) throw new BadRequestException("यह पता निजी (private) है — सर्वर का proxy सेटअप जाँचें (TRUST_PROXY_HOPS / CLIENT_IP_HEADER)।");
    const nets = await this.officeNets(t.organizationId);
    if (!nets.some((n) => sameNetwork(n.ip, ip))) {
      if (nets.length >= MAX_OFFICE_NETS) throw new ConflictException(`अधिकतम ${MAX_OFFICE_NETS} नेटवर्क — पहले कोई पुराना हटाएँ।`);
      nets.push({ ip, addedAt: new Date().toISOString(), addedById: t.userId });
      await this.writeNets(t.organizationId, t.userId, nets);
      this.log.log(`office network added by user ${t.userId} (${nets.length} total)`);
    }
    return this.officeNetwork(ip);
  }

  async removeOfficeNetwork(remove: string, ip: string | null): Promise<OfficeNetwork> {
    const t = this.manager();
    const nets = await this.officeNets(t.organizationId);
    const left = nets.filter((n) => n.ip !== remove);
    if (left.length !== nets.length) {
      await this.writeNets(t.organizationId, t.userId, left);
      this.log.log(`office network removed by user ${t.userId} (${left.length} left)`);
    }
    return this.officeNetwork(ip);
  }

  async holidays(organizationId: string): Promise<Holiday[]> {
    const rows = await this.prisma.holiday.findMany({ where: { organizationId }, orderBy: { date: "asc" } });
    return rows.map((h) => ({ id: h.id, date: h.date, name: h.name }));
  }

  private manager() {
    const t = requireTenantContext(this.cls);
    if (!isAttendanceManager(t.role)) throw new ForbiddenException("केवल मालिक या एडमिन।");
    return t;
  }

  async getSettings() {
    const t = requireTenantContext(this.cls);
    return { settings: await this.settings(t.organizationId), holidays: await this.holidays(t.organizationId), canManage: isAttendanceManager(t.role) };
  }

  async saveSettings(input: AttendanceSettings) {
    const t = this.manager();
    // The office networks live in the same row but are not part of the form: keep them.
    const nets = await this.officeNets(t.organizationId);
    const config = { ...input, officeNet: nets };
    await this.prisma.attendanceConfig.upsert({
      where: { organizationId: t.organizationId },
      create: { organizationId: t.organizationId, config, updatedById: t.userId },
      update: { config, updatedById: t.userId },
    });
    this.log.log(`settings updated by user ${t.userId}`);
    return this.getSettings();
  }

  async addHoliday(input: HolidayInput) {
    const t = this.manager();
    await this.prisma.holiday.upsert({
      where: { organizationId_date: { organizationId: t.organizationId, date: input.date } },
      create: { organizationId: t.organizationId, date: input.date, name: input.name },
      update: { name: input.name },
    });
    return this.holidays(t.organizationId);
  }

  async removeHoliday(id: string) {
    const t = this.manager();
    await this.prisma.holiday.deleteMany({ where: { id, organizationId: t.organizationId } });
    return this.holidays(t.organizationId);
  }

  // ---------- punching ----------
  async punchWeb(input: PunchInput, ip: string | null = null): Promise<PunchResult> {
    const t = requireTenantContext(this.cls);
    return this.punch(t.organizationId, t.userId, input, "web", new Date(), ip);
  }

  /** `ip` only for web presses: from the office internet, IN / OUT need no GPS. */
  async punch(organizationId: string, userId: string, input: PunchInput, source: "web" | "whatsapp", now = new Date(), ip: string | null = null): Promise<PunchResult> {
    const settings = await this.settings(organizationId);
    const officeNet = source === "web" && (await this.onOfficeNetwork(organizationId, ip));
    const day = istDay(now);
    const today = await this.prisma.attendanceRecord.findMany({ where: { organizationId, userId, day } });
    const d = punchDecision({
      kind: input.kind,
      now,
      lat: input.lat,
      lng: input.lng,
      reason: input.reason,
      accuracyM: input.accuracyM,
      officeNet,
      settings,
      today: today.map((r) => ({ kind: r.kind as "IN" | "OUT" | "FIELD", at: r.at })),
    });
    this.log.log(`punch ${input.kind} by user ${userId}: ${d.code}${officeNet ? " (office network)" : ""}`);
    if (!d.ok) {
      return {
        ok: false,
        code: d.code,
        ...(d.distanceM != null && d.code !== "lowAccuracy" ? { distanceM: d.distanceM } : {}),
        ...(d.code === "lowAccuracy" ? { accuracyM: Math.round(input.accuracyM!) } : {}),
      };
    }
    const rec = await this.prisma.attendanceRecord.create({
      data: {
        organizationId,
        userId,
        day,
        kind: input.kind,
        at: now,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        accuracyM: input.accuracyM ?? null,
        distanceM: d.distanceM,
        inside: d.inside,
        reason: input.reason?.trim() || null,
        source: officeNet ? "web-office-network" : source,
      },
    });
    return { ok: true, code: d.code, record: toPunch(rec), ...(d.distanceM != null ? { distanceM: d.distanceM } : {}), ...(officeNet ? { officeNet: true } : {}) };
  }

  async myToday(ip: string | null = null): Promise<MyAttendanceToday> {
    const t = requireTenantContext(this.cls);
    const onOfficeNetwork = await this.onOfficeNetwork(t.organizationId, ip);
    const settings = await this.settings(t.organizationId);
    const day = istDay(new Date());
    const [recs, hol] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { organizationId: t.organizationId, userId: t.userId, day }, orderBy: { at: "asc" } }),
      this.holidays(t.organizationId),
    ]);
    const leaves = await this.approvedLeaves(t.organizationId, day, day, t.userId);
    const st = dayStatus({ day, today: day, punches: recs.map((r) => ({ kind: r.kind as any, at: r.at })), leaves, settings, holidays: hol.map((h) => h.date) });
    const closed = closedDay(day, settings, hol.map((h) => h.date));
    return {
      day,
      in: recs.find((r) => r.kind === "IN") ? toPunch(recs.find((r) => r.kind === "IN")!) : null,
      out: recs.find((r) => r.kind === "OUT") ? toPunch(recs.find((r) => r.kind === "OUT")!) : null,
      field: recs.filter((r) => r.kind === "FIELD").map(toPunch),
      status: st.status,
      officeConfigured: settings.officeLat != null,
      onOfficeNetwork,
      closedReason: closed === "holiday" ? (hol.find((h) => h.date === day)?.name ?? "छुट्टी") : closed === "off" ? "साप्ताहिक अवकाश" : null,
    };
  }

  // ---------- overview ----------
  /** Active staff (everyone but OWNER) with WhatsApp numbers. */
  async staff(organizationId: string) {
    const ms = await this.prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE", role: { not: "OWNER" } },
      select: { user: { select: { id: true, fname: true, lname: true, mobile: true } } },
    });
    return ms
      .map((m) => ({ userId: m.user.id, name: `${m.user.fname} ${m.user.lname}`.trim(), firstName: m.user.fname, phone: phoneOf(m.user.mobile) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async approvedLeaves(organizationId: string, from: string, to: string, userId?: string) {
    return this.prisma.leaveRequest.findMany({
      where: { organizationId, status: "APPROVED", fromDate: { lte: to }, toDate: { gte: from }, ...(userId ? { userId } : {}) },
    });
  }

  /** Every staff member's status for the days of a month (or one day), org-explicit. */
  async grid(organizationId: string, days: string[], onlyUserId?: string, now = new Date()): Promise<AttendanceMonth["staff"]> {
    const settings = await this.settings(organizationId);
    const holidays = (await this.holidays(organizationId)).map((h) => h.date);
    const all = await this.staff(organizationId);
    const staff = onlyUserId ? all.filter((s) => s.userId === onlyUserId) : all;
    const from = days[0]!;
    const to = days[days.length - 1]!;
    const [recs, leaves] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { organizationId, day: { gte: from, lte: to }, ...(onlyUserId ? { userId: onlyUserId } : {}) }, orderBy: { at: "asc" } }),
      this.approvedLeaves(organizationId, from, to, onlyUserId),
    ]);
    const today = istDay(now);
    return staff.map((s) => ({
      userId: s.userId,
      name: s.name,
      days: days.map((day): StaffDay => {
        const mine = recs.filter((r) => r.userId === s.userId && r.day === day);
        const st = dayStatus({
          day,
          today,
          punches: mine.map((r) => ({ kind: r.kind as any, at: r.at })),
          leaves: leaves.filter((l) => l.userId === s.userId),
          settings,
          holidays,
        });
        return {
          userId: s.userId,
          name: s.name,
          day,
          status: st.status,
          lateMin: st.lateMin,
          inAt: mine.find((r) => r.kind === "IN")?.at.toISOString() ?? null,
          outAt: mine.find((r) => r.kind === "OUT")?.at.toISOString() ?? null,
          field: mine.filter((r) => r.kind === "FIELD").map((r) => ({ at: r.at.toISOString(), reason: r.reason })),
        };
      }),
    }));
  }

  /** Month view: OWNER/ADMIN everyone (or one staff); others only themselves. */
  async month(month: string, userId?: string): Promise<AttendanceMonth> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException("month = YYYY-MM");
    const t = requireTenantContext(this.cls);
    const only = isAttendanceManager(t.role) ? userId || undefined : t.userId;
    const days = monthDays(month);
    return { month, days, staff: await this.grid(t.organizationId, days, only) };
  }

  // ---------- leave ----------
  async apply(organizationId: string, userId: string, input: LeaveApplyInput, source: "web" | "whatsapp"): Promise<LeaveRequestItem> {
    if (input.toDate < input.fromDate) throw new BadRequestException("आखिरी तारीख पहली से पहले नहीं हो सकती।");
    let row: any = null;
    for (let i = 0; i < 5 && !row; i++) {
      const last = await this.prisma.leaveRequest.findFirst({ where: { organizationId }, orderBy: { number: "desc" }, select: { number: true } });
      try {
        row = await this.prisma.leaveRequest.create({
          data: { organizationId, number: (last?.number ?? 0) + 1, userId, fromDate: input.fromDate, toDate: input.toDate, halfDay: input.halfDay, type: input.type, reason: input.reason, source },
        });
      } catch (e: any) {
        if (e?.code !== "P2002") throw e;
      }
    }
    const item = await this.item(row);
    await this.notifyOwner(item);
    this.log.log(`leave #${item.number} applied by user ${userId} (${source})`);
    return item;
  }

  async applyWeb(input: LeaveApplyInput) {
    const t = requireTenantContext(this.cls);
    return this.apply(t.organizationId, t.userId, input, "web");
  }

  async leaves(status?: LeaveStatus): Promise<LeaveRequestItem[]> {
    const t = requireTenantContext(this.cls);
    const rows = await this.prisma.leaveRequest.findMany({
      where: { organizationId: t.organizationId, ...(isAttendanceManager(t.role) ? {} : { userId: t.userId }), ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return Promise.all(rows.map((r) => this.item(r)));
  }

  async decideWeb(id: string, approve: boolean) {
    const t = this.manager();
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, organizationId: t.organizationId } });
    if (!row) throw new NotFoundException("अर्ज़ी नहीं मिली।");
    return this.decide(row, approve, t.userId);
  }

  /** Owner on WhatsApp: "मंज़ूर 5" or a button. */
  async decideByNumber(organizationId: string, number: number, approve: boolean, byUserId: string | null): Promise<string> {
    const row = await this.prisma.leaveRequest.findFirst({ where: { organizationId, number } });
    if (!row) return `अर्ज़ी #${number} नहीं मिली।`;
    const item = await this.decide(row, approve, byUserId);
    return `${approve ? "✅ मंज़ूर" : "❌ नामंज़ूर"}: अर्ज़ी #${item.number} — ${item.userName} (${this.span(item)})`;
  }

  async decideById(organizationId: string, id: string, approve: boolean, byUserId: string | null): Promise<string> {
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, organizationId } });
    if (!row) return "अर्ज़ी नहीं मिली।";
    return this.decideByNumber(organizationId, row.number, approve, byUserId);
  }

  private async decide(row: any, approve: boolean, byUserId: string | null): Promise<LeaveRequestItem> {
    const updated = await this.prisma.leaveRequest.update({
      where: { id: row.id },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: byUserId, decidedAt: new Date() },
    });
    const item = await this.item(updated);
    const staff = (await this.staff(row.organizationId)).find((s) => s.userId === row.userId);
    if (staff?.phone) {
      const text = `आपकी छुट्टी की अर्ज़ी #${item.number} (${this.span(item)}) ${approve ? "मंज़ूर हो गई ✅" : "नामंज़ूर हुई ❌"}।`;
      await this.outbox.deliverDirect(staff.phone, `नमस्ते ${staff.firstName}, ${text}`, {
        name: WA_TEMPLATES.staffNotice.name,
        language: WA_TEMPLATES.staffNotice.language,
        params: [staff.firstName, `छुट्टी अर्ज़ी #${item.number}`, text.replace(/[।]$/, "")],
      });
    }
    this.log.log(`leave #${item.number} ${approve ? "approved" : "rejected"}`);
    return item;
  }

  private span(i: Pick<LeaveRequestItem, "fromDate" | "toDate" | "halfDay" | "type">) {
    const days = i.fromDate === i.toDate ? fmtDay(i.fromDate) : `${fmtDay(i.fromDate)} से ${fmtDay(i.toDate)}`;
    return `${days}${i.halfDay ? ", आधा दिन" : ""}, ${TYPE_HI[i.type]}`;
  }

  /** Owner gets the leave with मंज़ूर / नामंज़ूर buttons (inside the 24h window), else the template. */
  private async notifyOwner(item: LeaveRequestItem) {
    const summary = `${item.userName}, ${this.span(item)} — ${item.reason}`;
    for (const to of owners()) {
      if (process.env.WA_ACCESS_TOKEN && (await this.outbox.inWindow(to))) {
        const r = await this.outbox.post(to, {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: `🗓️ छुट्टी की अर्ज़ी #${item.number}\n${summary}`.slice(0, 1000) },
            action: {
              buttons: [
                { type: "reply", reply: { id: `leave:approve:${item.id}`, title: "मंज़ूर" } },
                { type: "reply", reply: { id: `leave:reject:${item.id}`, title: "नामंज़ूर" } },
              ],
            },
          },
        });
        if (r.ok) continue;
      }
      await this.outbox.deliverDirect(to, `🗓️ छुट्टी की अर्ज़ी #${item.number}\n${summary}\nजवाब: "मंज़ूर ${item.number}" या "नामंज़ूर ${item.number}"`, {
        name: WA_TEMPLATES.leaveRequest.name,
        language: WA_TEMPLATES.leaveRequest.language,
        params: [String(item.number), summary.replace(/\s+/g, " ").slice(0, 200)],
      });
    }
  }

  private async item(r: any): Promise<LeaveRequestItem> {
    const u = await this.prisma.user.findFirst({ where: { id: r.userId }, select: { fname: true, lname: true } });
    return {
      id: r.id,
      number: r.number,
      userId: r.userId,
      userName: u ? `${u.fname} ${u.lname}`.trim() : "—",
      fromDate: r.fromDate,
      toDate: r.toDate,
      halfDay: r.halfDay,
      type: r.type,
      reason: r.reason,
      status: r.status,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  // ---------- owner reports (jobs) ----------
  /** "आए / देर / नहीं आए / छुट्टी / बाहर" for today. */
  async morningReport(organizationId: string, now = new Date()): Promise<string> {
    const day = istDay(now);
    const rows = (await this.grid(organizationId, [day], undefined, now)).map((s) => s.days[0]!);
    const g = (st: string[]) => rows.filter((r) => st.includes(r.status));
    const t = (iso: string | null) => (iso ? fmtTime(new Date(iso)) : "");
    const line = (title: string, list: StaffDay[], f: (d: StaffDay) => string) => (list.length ? [`${title} (${list.length}): ${list.map(f).join(", ")}`] : []);
    return [
      `🕘 आज की हाज़िरी (${fmtDay(day)})`,
      ...line("✅ आए", g(["present"]), (d) => `${d.name} ${t(d.inAt)}`),
      ...line("⏰ देर", g(["late", "halfDay"]), (d) => `${d.name} ${t(d.inAt)} (${d.lateMin} मिनट)`),
      ...line("🚶 बाहर का काम", g(["field"]), (d) => `${d.name}${d.field[0]?.reason ? ` — ${d.field[0].reason}` : ""}`),
      ...line("🏖️ छुट्टी", g(["leave", "halfLeave"]), (d) => d.name),
      ...line("❌ नहीं आए", g(["absent"]), (d) => d.name),
    ].join("\n");
  }

  /**
   * The owner's question "हाज़िरी किसने नहीं लगाई" on WhatsApp: today so far --
   * who has not pressed IN, who came but has not pressed OUT, who is on leave
   * or out on field work -- in the words of the morning / evening reports.
   */
  async todayReport(organizationId: string, now = new Date()): Promise<string> {
    const day = istDay(now);
    const rows = (await this.grid(organizationId, [day], undefined, now)).map((s) => s.days[0]!);
    if (!rows.length) return "टीम में अभी कोई स्टाफ नहीं है।";
    if (rows.every((r) => r.status === "off" || r.status === "holiday")) return `🗓️ आज (${fmtDay(day)}) ऑफिस की छुट्टी है।`;
    const g = (st: string[]) => rows.filter((r) => st.includes(r.status));
    const t = (iso: string | null) => (iso ? fmtTime(new Date(iso)) : "");
    const line = (title: string, list: StaffDay[], f: (d: StaffDay) => string) => (list.length ? [`${title} (${list.length}): ${list.map(f).join(", ")}`] : []);
    const notOut = rows.filter((r) => r.inAt && !r.outAt);
    const came = rows.filter((r) => r.inAt);
    // Only when the owner's rule makes it late / half day (Settings: इतने मिनट बाद देर / आधा दिन).
    const lateNote = (d: StaffDay) => (d.status === "halfDay" ? ` (हाफ़ डे — ${d.lateMin} मिनट देर)` : d.status === "late" ? ` (${d.lateMin} मिनट देर)` : "");
    const lines = [
      `🕘 आज की हाज़िरी अभी तक (${fmtDay(day)}, ${fmtTime(now)})`,
      ...line("❌ IN नहीं किया", g(["absent"]), (d) => d.name),
      ...line("🌆 OUT नहीं किया", notOut, (d) => `${d.name} (IN ${t(d.inAt)})`),
      ...line("🏖️ छुट्टी", g(["leave", "halfLeave"]), (d) => `${d.name}${d.status === "halfLeave" ? " (आधा दिन)" : ""}`),
      ...line("🚶 बाहर का काम", g(["field"]), (d) => `${d.name}${d.field[0]?.reason ? ` — ${d.field[0].reason}` : ""}`),
      ...line("✅ आए", came, (d) => `${d.name} ${t(d.inAt)}${d.outAt ? `–${t(d.outAt)}` : ""}${lateNote(d)}`),
    ];
    if (lines.length === 1) lines.push("सबकी हाज़िरी पूरी है।");
    return lines.join("\n");
  }

  /**
   * Today's missing IN / OUT by name -- the same grid and rules as todayReport
   * (the owner's "हाज़िरी किसने नहीं लगाई"): absent = no IN, came without OUT.
   */
  async todayMissing(organizationId: string, now = new Date()): Promise<{ off: boolean; noIn: string[]; noOut: string[] }> {
    const day = istDay(now);
    const rows = (await this.grid(organizationId, [day], undefined, now)).map((s) => s.days[0]!);
    const off = !rows.length || rows.every((r) => r.status === "off" || r.status === "holiday");
    return { off, noIn: rows.filter((r) => r.status === "absent").map((r) => r.name), noOut: rows.filter((r) => r.inAt && !r.outAt).map((r) => r.name) };
  }

  /** Staff who came but did not press "जा रहा हूँ". */
  async eveningReport(organizationId: string, now = new Date()): Promise<string | null> {
    const day = istDay(now);
    const rows = (await this.grid(organizationId, [day], undefined, now)).map((s) => s.days[0]!);
    const missing = rows.filter((r) => r.inAt && !r.outAt);
    return missing.length ? `🌆 आज OUT नहीं किया (${missing.length}): ${missing.map((m) => m.name).join(", ")}` : null;
  }

  ownerNumbers() {
    return owners();
  }
}
