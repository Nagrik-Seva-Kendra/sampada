import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { clientIp } from "../common/client-ip.js";
import { AttendanceSettingsInput, HolidayInput, LeaveApplyInput, LeaveStatus, PunchInput, SalaryAdjustInput, SalarySetInput } from "@sampada/shared";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { AttendanceService } from "./attendance.service.js";
import { SalaryService } from "./salary.service.js";
import { AttendanceExportService } from "./attendance-export.service.js";

const file = (res: Response, data: Buffer, name: string) => {
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename=${JSON.stringify(name)}`,
    "Cache-Control": "private, no-store",
  });
  return new StreamableFile(data);
};

/** हाज़िरी: everyone their own; OWNER/ADMIN everyone + settings + leave decisions. Salary: OWNER only. */
@Controller("attendance")
@UseGuards(JwtStaffGuard)
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly salary: SalaryService,
    private readonly exports: AttendanceExportService,
  ) {}

  @Get("settings")
  settings() {
    return this.service.getSettings();
  }

  @Put("settings")
  saveSettings(@Body() body: unknown) {
    return this.service.saveSettings(AttendanceSettingsInput.parse(body));
  }

  @Post("holidays")
  addHoliday(@Body() body: unknown) {
    return this.service.addHoliday(HolidayInput.parse(body));
  }

  @Delete("holidays/:id")
  removeHoliday(@Param("id") id: string) {
    return this.service.removeHoliday(id);
  }

  @Get("me/today")
  myToday(@Req() req: Request) {
    return this.service.myToday(clientIp(req));
  }

  @Post("punch")
  punch(@Body() body: unknown, @Req() req: Request) {
    return this.service.punchWeb(PunchInput.parse(body), clientIp(req));
  }

  /** OWNER/ADMIN: the office internet connections (computers without GPS). */
  @Get("office-network")
  officeNetwork(@Req() req: Request) {
    return this.service.officeNetwork(clientIp(req));
  }

  /** OWNER/ADMIN, from the office: add the network this request comes from. */
  @Post("office-network")
  addOfficeNetwork(@Req() req: Request) {
    return this.service.addOfficeNetwork(clientIp(req));
  }

  @Delete("office-network/:ip")
  removeOfficeNetwork(@Param("ip") ip: string, @Req() req: Request) {
    return this.service.removeOfficeNetwork(ip, clientIp(req));
  }

  @Get("month")
  month(@Query("month") month: string, @Query("userId") userId?: string) {
    return this.service.month(month, userId);
  }

  @Get("month/export")
  async monthExport(@Query("month") month: string, @Query("userId") userId: string | undefined, @Res({ passthrough: true }) res: Response) {
    return file(res, await this.exports.monthXlsx(month, userId), `attendance-${month}.xlsx`);
  }

  @Get("leaves")
  leaves(@Query("status") status?: string) {
    const s = LeaveStatus.safeParse(status);
    return this.service.leaves(s.success ? s.data : undefined);
  }

  @Post("leaves")
  apply(@Body() body: unknown) {
    return this.service.applyWeb(LeaveApplyInput.parse(body));
  }

  @Post("leaves/:id/approve")
  approve(@Param("id") id: string) {
    return this.service.decideWeb(id, true);
  }

  @Post("leaves/:id/reject")
  reject(@Param("id") id: string) {
    return this.service.decideWeb(id, false);
  }

  // ---------- salary: OWNER only (enforced in SalaryService) ----------
  @Get("salary/history/:userId")
  history(@Param("userId") userId: string) {
    return this.salary.history(userId);
  }

  @Post("salary/rate")
  setRate(@Body() body: unknown) {
    return this.salary.setRate(SalarySetInput.parse(body));
  }

  @Get("salary/sheet")
  sheet(@Query("month") month: string) {
    return this.salary.sheet(month);
  }

  @Post("salary/sheet/:month/adjust")
  adjust(@Param("month") month: string, @Body() body: unknown) {
    return this.salary.adjust(month, SalaryAdjustInput.parse(body));
  }

  @Post("salary/sheet/:month/final")
  finalize(@Param("month") month: string) {
    return this.salary.finalize(month);
  }

  @Post("salary/sheet/:month/send/:userId")
  send(@Param("month") month: string, @Param("userId") userId: string) {
    return this.salary.send(month, userId);
  }

  @Get("salary/sheet/:month/export")
  async salaryExport(@Param("month") month: string, @Res({ passthrough: true }) res: Response) {
    return file(res, await this.salary.exportXlsx(month), `salary-${month}.xlsx`);
  }
}
