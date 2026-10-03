import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AiDraftToggleInput, AiEvalStartInput, AiStarInput } from "@sampada/shared";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
import { AiDraftService } from "./ai-draft.service.js";

/** "AI से पूरा ड्राफ्ट": request button (OWNER/ADMIN or assignee), settings / stars / eval (OWNER). */
@Controller("ai-draft")
@UseGuards(JwtStaffGuard)
export class AiDraftController {
  constructor(private readonly service: AiDraftService) {}

  @Get("settings")
  settings() {
    return this.service.settings();
  }

  @Put("settings/type")
  toggle(@Body() body: unknown) {
    const i = AiDraftToggleInput.parse(body);
    return this.service.toggle(i.propertyType, i.enabled);
  }

  @Put("settings/star")
  star(@Body() body: unknown) {
    const i = AiStarInput.parse(body);
    return this.service.star(i.deedId, i.starred);
  }

  @Get("evals")
  evals() {
    return this.service.evals();
  }

  @Post("evals")
  startEval(@Body() body: unknown) {
    const i = AiEvalStartInput.parse(body);
    return this.service.startEval(i.propertyType, i.deedType);
  }

  @Get("requests/:id")
  availability(@Param("id") id: string) {
    return this.service.availability(id);
  }

  @Post("requests/:id")
  generate(@Param("id") id: string, @Req() req: Request & { user: StaffUser }) {
    return this.service.generate(id, req.user);
  }

  @Post("deeds/:id/reviewed")
  reviewed(@Param("id") id: string) {
    return this.service.markReviewed(id);
  }
}
