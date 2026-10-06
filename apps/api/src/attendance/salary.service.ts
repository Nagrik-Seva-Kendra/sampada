import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { type SalaryAdjustInput, type SalaryHistoryItem, type SalaryLine, type SalarySetInput, type SalarySheet, WA_TEMPLATES } from "@sampada/shared";
import { type Cell, xlsx } from "../common/xlsx.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { WaOutboxService } from "../whatsapp/wa-outbox.service.js";
import { monthDays, salaryLine } from "./attendance-rules.js";
import { AttendanceService } from "./attendance.service.js";

type Adjust = { bonus: number; advance: number; otherDeduction: number; note: string | null };

/**
 * Salary: OWNER only (ADMIN and staff get 403 from the server). Monthly salary
 * history per employee, the month sheet computed from attendance and leave,
 * the owner's adjustments, FINAL lock, Excel export, and a WhatsApp slip only
 * when the owner presses "भेजो". Amounts are never logged.
 */
@Injectable()
export class SalaryService {
  private readonly log = new Logger("Salary");

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly attendance: AttendanceService,
    private readonly outbox: WaOutboxService,
  ) {}

  private owner() {
    const t = requireTenantContext(this.cls);
    if (t.role !== "OWNER") throw new ForbiddenException("वेतन केवल मालिक देख सकते हैं।");
    return t;
  }

  async history(userId: string): Promise<SalaryHistoryItem[]> {
    const t = this.owner();
    const rows = await this.prisma.salaryRate.findMany({ where: { organizationId: t.organizationId, userId }, orderBy: { effectiveFrom: "desc" } });
    return rows.map((r) => ({ id: r.id, monthly: r.monthly, effectiveFrom: r.effectiveFrom, createdAt: r.createdAt.toISOString() }));
  }

  async setRate(input: SalarySetInput): Promise<SalaryHistoryItem[]> {
    const t = this.owner();
    const staff = await this.attendance.staff(t.organizationId);
    if (!staff.some((s) => s.userId === input.userId)) throw new BadRequestException("यह कर्मचारी इस संस्था में नहीं है।");
    await this.prisma.salaryRate.create({ data: { organizationId: t.organizationId, userId: input.userId, monthly: input.monthly, effectiveFrom: input.effectiveFrom, createdById: t.userId } });
    this.log.log(`salary changed for user ${input.userId} by owner`);
    return this.history(input.userId);
  }

  /** Computes (DRAFT) or returns (FINAL) the month's sheet. */
  async sheet(month: string): Promise<SalarySheet> {
    const t = this.owner();
    return this.sheetFor(t.organizationId, month);
  }

  async sheetFor(organizationId: string, month: string, now = new Date()): Promise<SalarySheet> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException("month = YYYY-MM");
    const existing = await this.prisma.salarySheet.findUnique({ where: { organizationId_month: { organizationId, month } } });
    if (existing?.status === "FINAL") return { month, status: "FINAL", lines: existing.lines as unknown as SalaryLine[], sentTo: (existing.sentTo as string[]) ?? [] };
    const adjustments = ((existing?.adjustments as Record<string, Adjust>) ?? {}) as Record<string, Adjust>;
    const lines = await this.compute(organizationId, month, adjustments, now);
    await this.prisma.salarySheet.upsert({
      where: { organizationId_month: { organizationId, month } },
      create: { organizationId, month, lines: lines as any, adjustments: adjustments as any },
      update: { lines: lines as any },
    });
    return { month, status: "DRAFT", lines, sentTo: (existing?.sentTo as string[]) ?? [] };
  }

  private async compute(organizationId: string, month: string, adjustments: Record<string, Adjust>, now: Date): Promise<SalaryLine[]> {
    const days = monthDays(month);
    const settings = await this.attendance.settings(organizationId);
    const grid = await this.attendance.grid(organizationId, days, undefined, now);
    const rates = await this.prisma.salaryRate.findMany({ where: { organizationId }, orderBy: { effectiveFrom: "asc" } });
    const lastDay = days[days.length - 1]!;
    const out: SalaryLine[] = [];
    for (const s of grid) {
      const mine = rates.filter((r) => r.userId === s.userId);
      const current = [...mine].reverse().find((r) => r.effectiveFrom <= lastDay);
      if (!current) continue; // no salary set yet
      const start = mine[0]!.effectiveFrom;
      const adj = adjustments[s.userId] ?? { bonus: 0, advance: 0, otherDeduction: 0, note: null };
      const l = salaryLine({
        monthly: current.monthly,
        days: s.days.map((d) => ({ day: d.day, status: d.status })),
        startDate: start > days[0]! ? start : null,
        paidLeavePerMonth: settings.paidLeavePerMonth,
        lateDeductionDay: settings.lateDeductionDay,
        bonus: adj.bonus,
        advance: adj.advance,
        otherDeduction: adj.otherDeduction,
      });
      out.push({ userId: s.userId, name: s.name, ...l, note: adj.note });
    }
    return out;
  }

  async adjust(month: string, input: SalaryAdjustInput): Promise<SalarySheet> {
    const t = this.owner();
    const row = await this.prisma.salarySheet.findUnique({ where: { organizationId_month: { organizationId: t.organizationId, month } } });
    if (row?.status === "FINAL") throw new BadRequestException("यह शीट फ़ाइनल हो चुकी है।");
    const adjustments = { ...((row?.adjustments as Record<string, Adjust>) ?? {}), [input.userId]: { bonus: input.bonus, advance: input.advance, otherDeduction: input.otherDeduction, note: input.note } };
    await this.prisma.salarySheet.upsert({
      where: { organizationId_month: { organizationId: t.organizationId, month } },
      create: { organizationId: t.organizationId, month, lines: [] as any, adjustments: adjustments as any },
      update: { adjustments: adjustments as any },
    });
    return this.sheetFor(t.organizationId, month);
  }

  async finalize(month: string): Promise<SalarySheet> {
    const t = this.owner();
    const s = await this.sheetFor(t.organizationId, month);
    if (s.status === "FINAL") return s;
    await this.prisma.salarySheet.update({ where: { organizationId_month: { organizationId: t.organizationId, month } }, data: { status: "FINAL", finalizedAt: new Date(), lines: s.lines as any } });
    this.log.log(`salary sheet ${month} finalized`);
    return { ...s, status: "FINAL" };
  }

  /** WhatsApp slip to one employee -- only on the owner's "भेजो", only for a FINAL sheet. */
  async send(month: string, userId: string): Promise<{ sent: boolean; reason: string | null }> {
    const t = this.owner();
    const s = await this.sheetFor(t.organizationId, month);
    if (s.status !== "FINAL") throw new BadRequestException("पहले शीट फ़ाइनल करें।");
    const line = s.lines.find((l) => l.userId === userId);
    if (!line) throw new NotFoundException("इस कर्मचारी की वेतन पंक्ति नहीं मिली।");
    const staff = (await this.attendance.staff(t.organizationId)).find((x) => x.userId === userId);
    if (!staff?.phone) return { sent: false, reason: "कर्मचारी का मोबाइल Team पेज पर नहीं है।" };
    const r = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
    const text = [
      `🧾 वेतन पर्ची — ${month}`,
      `${line.name}`,
      `मासिक वेतन: ${r(line.monthly)}`,
      `कार्य दिवस: ${line.workingDays}, उपस्थित: ${line.present}, आधे दिन: ${line.halfDays}`,
      `छुट्टी: सवैतनिक ${line.paidLeave}, अवैतनिक ${line.unpaidLeave}, अनुपस्थित: ${line.absent}`,
      `कटौती: ${r(line.deduction)}${line.bonus ? `, बोनस: ${r(line.bonus)}` : ""}${line.advance ? `, एडवांस: ${r(line.advance)}` : ""}${line.otherDeduction ? `, अन्य कटौती: ${r(line.otherDeduction)}` : ""}`,
      ...(line.note ? [`नोट: ${line.note}`] : []),
      `देय राशि: ${r(line.payable)}`,
    ].join("\n");
    const d = await this.outbox.deliverDirect(staff.phone, text, {
      name: WA_TEMPLATES.staffNotice.name,
      language: WA_TEMPLATES.staffNotice.language,
      params: [staff.firstName, `वेतन पर्ची ${month}`, "आपकी पर्ची तैयार है, देखने के लिए इस नंबर पर कोई संदेश भेजें"],
    });
    if (d.status === "SENT") {
      const row = await this.prisma.salarySheet.findUnique({ where: { organizationId_month: { organizationId: t.organizationId, month } } });
      const sentTo = [...new Set([...(((row?.sentTo as string[]) ?? []) as string[]), userId])];
      await this.prisma.salarySheet.update({ where: { organizationId_month: { organizationId: t.organizationId, month } }, data: { sentTo } });
    }
    this.log.log(`salary slip ${month} for user ${userId}: ${d.status}`);
    return { sent: d.status === "SENT", reason: d.reason };
  }

  async exportXlsx(month: string): Promise<Buffer> {
    const s = await this.sheet(month);
    const head: Cell[] = ["कर्मचारी", "मासिक वेतन", "कुल दिन", "बंद दिन", "कार्य दिवस", "प्रति दिन", "उपस्थित", "आधे दिन", "देर", "सवैतनिक छुट्टी", "अवैतनिक छुट्टी", "अनुपस्थित", "कटौती दिन", "कटौती", "बोनस", "एडवांस", "अन्य कटौती", "देय राशि", "नोट"];
    const rows: Cell[][] = s.lines.map((l) => [l.name, l.monthly, l.totalDays, l.offDays, l.workingDays, l.perDay, l.present, l.halfDays, l.lateCount, l.paidLeave, l.unpaidLeave, l.absent, l.unpaidDays, l.deduction, l.bonus, l.advance, l.otherDeduction, l.payable, l.note]);
    return xlsx([{ name: `वेतन ${month}`, rows: [[`वेतन शीट ${month} (${s.status === "FINAL" ? "फ़ाइनल" : "ड्राफ्ट"})`], head, ...rows] }]);
  }
}
