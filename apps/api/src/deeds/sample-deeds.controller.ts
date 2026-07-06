import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CreateSampleDeedInput, DeedType, UpdateSampleDeedInput } from "@sampada/shared";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
import { SampleDeedsService } from "./sample-deeds.service.js";

type StaffRequest = Request & { user: StaffUser };

@Controller("sample-deeds")
@UseGuards(JwtStaffGuard)
export class SampleDeedsController {
  constructor(private readonly service: SampleDeedsService) {}

  /** Own deeds for one deed type (ADMIN: everyone's). */
  @Get()
  list(@Query("type") typeRaw: unknown, @Req() req: StaffRequest) {
    return this.service.listByType(DeedType.parse(typeRaw), req.user);
  }

  /** Draft a new deed for a type, owned by the caller. */
  @Post()
  create(@Body() body: unknown, @Req() req: StaffRequest) {
    return this.service.create(CreateSampleDeedInput.parse(body), req.user);
  }

  /** Edit own deed (ADMIN: any deed). */
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    return this.service.update(id, UpdateSampleDeedInput.parse(body), req.user);
  }

  /** Delete own deed (ADMIN: any deed). */
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: StaffRequest) {
    await this.service.remove(id, req.user);
    return { deleted: true };
  }
}
