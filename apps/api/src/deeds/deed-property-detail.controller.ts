import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { DeedPropertyDetailCreateInput } from "@sampada/shared";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { DeedPropertyDetailService } from "./deed-property-detail.service.js";
import { DeedVisibleGuard } from "./deed-visible.guard.js";

/** Staff-only structured property data for a deed (plot no., khasra, measurements, chauhaddi). */
@Controller("deeds/:deedId/property-detail")
// JwtStaffGuard first: it is what puts the tenant in context, which is what
// DeedVisibleGuard reads through to decide the deed exists at all.
@UseGuards(JwtStaffGuard, DeedVisibleGuard)
export class DeedPropertyDetailController {
  constructor(private readonly service: DeedPropertyDetailService) {}

  @Get()
  get(@Param("deedId") deedId: string) {
    return this.service.get(deedId);
  }

  /** AI-assisted prefill: reads the deed's own text and returns a suggestion, never saves anything. */
  @Post("extract")
  extract(@Param("deedId") deedId: string) {
    return this.service.extractFromDeedText(deedId);
  }

  @Put()
  upsert(@Param("deedId") deedId: string, @Body() body: unknown) {
    const input = DeedPropertyDetailCreateInput.parse(body);
    return this.service.upsert(deedId, input);
  }

  @Delete()
  async remove(@Param("deedId") deedId: string) {
    await this.service.remove(deedId);
    return { removed: true };
  }
}
