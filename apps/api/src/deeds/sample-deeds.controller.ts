import {
  Body,
  Controller,
  Delete,
  BadRequestException,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CreateSampleDeedInput, DeedType, ListDeedsQuery, UpdateSampleDeedInput } from "@sampada/shared";
import { JwtStaffGuard, type StaffUser } from "../auth/jwt-staff.guard.js";
import { SampleDeedsService } from "./sample-deeds.service.js";

type StaffRequest = Request & { user: StaffUser };

@Controller("sample-deeds")
@UseGuards(JwtStaffGuard)
export class SampleDeedsController {
  constructor(private readonly service: SampleDeedsService) {}

  /** Own deeds for one deed type (ADMIN/EMPLOYEE: everyone's). */
  @Get()
  list(@Query("type") typeRaw: unknown, @Req() req: StaffRequest) {
    return this.service.listByType(DeedType.parse(typeRaw), req.user);
  }

  /** Admin/Employee: every sample deed across every type (all creators) — the "All Deeds" page, with optional filters. */
  @Get("all")
  all(@Query() query: unknown, @Req() req: StaffRequest) {
    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
      throw new ForbiddenException("Only admin/employee can view all deeds.");
    }
    return this.service.listAll(ListDeedsQuery.parse(query));
  }

  /** Admin/Employee: distinct creators for the "All Deeds" creator filter dropdown. */
  @Get("creators")
  creators(@Req() req: StaffRequest) {
    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
      throw new ForbiddenException("Only admin/employee can view creators.");
    }
    return this.service.listCreators();
  }

  /**
   * One sample deed with its full content (for view/print/edit). Lists omit the
   * body, so this is the only way to read it. ADMIN/EMPLOYEE may read any deed;
   * anyone else may read only their own.
   */
  @Get(":id")
  async getOne(@Param("id") id: string, @Req() req: StaffRequest) {
    const deed = await this.service.getOne(id);
    if (!deed) throw new NotFoundException("Deed not found.");
    const canViewAny = req.user.role === "ADMIN" || req.user.role === "EMPLOYEE";
    if (!canViewAny && deed.createdById !== req.user.id) {
      throw new NotFoundException("Deed not found.");
    }
    return deed;
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

  /**
   * AI-assisted drafting for this deed's content — generates a fresh draft
   * if empty, or corrects/completes the existing one, per free-text
   * instructions. Same permission model as update().
   */
  @Post(":id/ai-draft")
  aiDraft(@Param("id") id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const { instructions, deedTypeName } = (body ?? {}) as { instructions?: unknown; deedTypeName?: unknown };
    if (typeof instructions !== "string" || !instructions.trim()) {
      throw new BadRequestException("Instructions are required.");
    }
    return this.service.aiDraft(
      id,
      { instructions, deedTypeName: typeof deedTypeName === "string" ? deedTypeName : undefined },
      req.user,
    );
  }

}
