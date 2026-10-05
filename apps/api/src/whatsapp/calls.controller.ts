import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ArchiveCopySendInput, ArchiveCopySettingsInput, SatisfactionSettingsInput, CallbackAssignInput, CallbackDoneInput, FollowUpRulesInput } from "@sampada/shared";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { CallbackService } from "./callback.service.js";
import { FollowUpService } from "./followup.service.js";
import { ArchiveCopyService } from "./archive-copy.service.js";
import { SatisfactionService } from "./satisfaction.service.js";

/** Web "कॉल बैक" and "फ़ॉलो-अप" tabs. Same access as WhatsApp requests: OWNER/ADMIN all, others their own. */
@Controller("whatsapp")
@UseGuards(JwtStaffGuard)
export class CallsController {
  constructor(
    private readonly callbacks: CallbackService,
    private readonly followups: FollowUpService,
    private readonly copies: ArchiveCopyService,
    private readonly satisfaction: SatisfactionService,
  ) {}

  // ---------- customer satisfaction (OWNER/ADMIN view, OWNER edits) ----------
  @Get("satisfaction")
  satisfactionSettings() {
    return this.satisfaction.settings();
  }

  @Put("satisfaction")
  saveSatisfaction(@Body() body: unknown) {
    return this.satisfaction.save(SatisfactionSettingsInput.parse(body));
  }

  // ---------- registry copies (OWNER/ADMIN; on/off OWNER) ----------
  @Get("archive-copy/settings")
  copySettings() {
    return this.copies.settings();
  }

  @Put("archive-copy/settings")
  saveCopySettings(@Body() body: unknown) {
    const i = ArchiveCopySettingsInput.parse(body);
    return this.copies.saveSettings(i.enabled, i.dailyLimit);
  }

  @Get("archive-copy")
  copies_() {
    return this.copies.list();
  }

  @Get("archive-copy/:id/deed")
  copyDeed(@Param("id") id: string) {
    return this.copies.deed(id);
  }

  @Post("archive-copy/:id/send")
  sendCopy(@Param("id") id: string, @Body() body: unknown) {
    return this.copies.send(id, ArchiveCopySendInput.parse(body).pdfBase64);
  }

  @Post("archive-copy/:id/reject")
  rejectCopy(@Param("id") id: string) {
    return this.copies.reject(id);
  }

  @Get("calls")
  list() {
    return this.callbacks.list();
  }

  @Get("calls/count")
  async count() {
    return { newCount: await this.callbacks.count() };
  }

  @Post("calls/:id/done")
  done(@Param("id") id: string, @Body() body: unknown) {
    return this.callbacks.done(id, CallbackDoneInput.parse(body).note);
  }

  @Post("calls/:id/reopen")
  reopen(@Param("id") id: string) {
    return this.callbacks.reopen(id);
  }

  @Post("calls/:id/assign")
  assign(@Param("id") id: string, @Body() body: unknown) {
    return this.callbacks.assign(id, CallbackAssignInput.parse(body).assigneeId);
  }

  @Get("follow-ups")
  followUps() {
    return this.followups.list();
  }

  @Put("follow-ups/rules")
  saveRules(@Body() body: unknown) {
    return this.followups.saveRules(FollowUpRulesInput.parse(body).rules);
  }
}
