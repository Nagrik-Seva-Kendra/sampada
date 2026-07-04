import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CreateDeedInput } from "@sampada/shared";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
import { DeedsService } from "./deeds.service.js";

type StaffRequest = Request & { user: StaffUser };

@Controller("deeds")
@UseGuards(JwtStaffGuard)
export class DeedsController {
  constructor(private readonly service: DeedsService) {}

  /** Create a deed owned by the caller. */
  @Post()
  create(@Body() body: unknown, @Req() req: StaffRequest) {
    return this.service.create(CreateDeedInput.parse(body), req.user);
  }

  /**
   * Own deeds by default. ADMIN may pass ?creatorId=<partner-id> to view one
   * partner's register (kept separate from the admin's own).
   */
  @Get()
  list(@Req() req: StaffRequest, @Query("creatorId") creatorId?: string) {
    if (creatorId && creatorId !== req.user.id) {
      if (req.user.role !== "ADMIN") {
        throw new ForbiddenException("Only the admin can view other registers.");
      }
      return this.service.listByCreator(creatorId);
    }
    return this.service.listOwn(req.user);
  }

  /** Delete own deed (ADMIN: any deed). */
  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: StaffRequest) {
    return this.service.remove(id, req.user);
  }
}
