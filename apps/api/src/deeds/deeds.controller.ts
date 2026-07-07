import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CreateDeedInput, UpdateDeedInput } from "@sampada/shared";
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
   * Own deeds by default. ADMIN/EMPLOYEE may pass ?creatorId=<partner-id> to
   * view one partner's register, or ?creatorId=all to view every partner's
   * deeds combined (excludes the admin's and employees' own deeds).
   */
  @Get()
  list(@Req() req: StaffRequest, @Query("creatorId") creatorId?: string) {
    if (creatorId === "all") {
      if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
        throw new ForbiddenException("Only admin/employee can view other registers.");
      }
      return this.service.listAllPartners();
    }
    if (creatorId === "everyone") {
      if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
        throw new ForbiddenException("Only admin/employee can view every register.");
      }
      return this.service.listEveryone();
    }
    if (creatorId && creatorId !== req.user.id) {
      if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
        throw new ForbiddenException("Only the admin/employee can view other registers.");
      }
      return this.service.listByCreator(creatorId);
    }
    return this.service.listOwn(req.user);
  }

  /** Edit own deed (ADMIN: any deed, e.g. a partner's). */
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    return this.service.update(id, UpdateDeedInput.parse(body), req.user);
  }

  /** Delete own deed (ADMIN: any deed). */
  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: StaffRequest) {
    return this.service.remove(id, req.user);
  }
}
