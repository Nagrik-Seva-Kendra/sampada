import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DeedType } from "@sampada/shared";
import type {
  CreateSampleDeedInput,
  SampleDeedItem,
  SampleDeedListItem,
  UpdateSampleDeedInput,
} from "@sampada/shared";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { DeedTemplate } from "@prisma/client";

function toItem(row: DeedTemplate): SampleDeedItem {
  return {
    id: row.id,
    type: row.type as DeedType,
    title: row.title,
    content: row.content,
    status: row.status as SampleDeedItem["status"],
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdByRole: (row.createdByRole ?? undefined) as SampleDeedItem["createdByRole"],
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Example deeds shown on a deed-type's public info page. Each staff member
 * (admin or partner) can draft their own; ADMIN additionally sees everyone's.
 * Backed by the DeedTemplate table.
 */
@Injectable()
export class SampleDeedsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ADMIN and EMPLOYEE see every ADMIN/EMPLOYEE deed of this type combined
   * (partners' own drafts are excluded here — those surface only in the
   * partner's own register / the admin's "All Partner Deeds" page). PARTNER
   * sees only their own. Newest first.
   */
  async listByType(type: DeedType, user: StaffUser): Promise<SampleDeedItem[]> {
    const canViewAll = user.role === "ADMIN" || user.role === "EMPLOYEE";
    const rows = await this.prisma.deedTemplate.findMany({
      where: canViewAll
        ? { type, OR: [{ createdByRole: { not: "PARTNER" } }, { createdByRole: null }] }
        : { type, createdById: user.id },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toItem);
  }

  /**
   * ADMIN/EMPLOYEE: every partner's sample deeds across every deed type,
   * combined, newest first — powers the admin's "All Partner Deeds" page.
   * Pass creatorId to narrow it down to one partner.
   */
  async listPartners(creatorId?: string): Promise<SampleDeedItem[]> {
    const rows = await this.prisma.deedTemplate.findMany({
      where: { createdByRole: "PARTNER", ...(creatorId ? { createdById: creatorId } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toItem);
  }

  /**
   * ADMIN/EMPLOYEE: every sample deed across every type (all creators),
   * combined, newest first — powers the "All Deeds" management page. Drops the
   * heavy content body to keep the list light.
   */
  async listAll(): Promise<SampleDeedListItem[]> {
    const rows = await this.prisma.deedTemplate.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        createdById: true,
        createdByName: true,
        createdByRole: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type as DeedType,
      title: row.title,
      status: row.status as SampleDeedListItem["status"],
      createdById: row.createdById,
      createdByName: row.createdByName,
      createdByRole: (row.createdByRole ?? undefined) as SampleDeedListItem["createdByRole"],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Deed counts per creator id (for the admin's partner list). */
  async countsByCreator(): Promise<Record<string, number>> {
    const rows = await this.prisma.deedTemplate.groupBy({
      by: ["createdById"],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.createdById, row._count._all]));
  }

  /** Fetch one sample deed (with its full content) by id, or null if absent. */
  async getOne(id: string): Promise<SampleDeedItem | null> {
    const row = await this.prisma.deedTemplate.findUnique({ where: { id } });
    return row ? toItem(row) : null;
  }

  /** Draft a new deed for a type, owned by the caller. */
  async create(input: CreateSampleDeedInput, user: StaffUser): Promise<SampleDeedItem> {
    const row = await this.prisma.deedTemplate.create({
      data: {
        id: randomUUID(),
        type: input.type,
        title: input.title,
        content: input.content,
        status: "active",
        createdById: user.id,
        createdByName: user.name,
        createdByRole: user.role,
        createdAt: new Date(),
      },
    });
    return toItem(row);
  }

  /** Edit own deed (ADMIN and EMPLOYEE: any deed). */
  async update(id: string, input: UpdateSampleDeedInput, user: StaffUser): Promise<SampleDeedItem> {
    const canEditAny = user.role === "ADMIN" || user.role === "EMPLOYEE";
    const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
    if (!existing || (!canEditAny && existing.createdById !== user.id)) {
      throw new NotFoundException("Deed not found.");
    }
    const row = await this.prisma.deedTemplate.update({ where: { id }, data: input });
    return toItem(row);
  }

  /** Delete own deed (ADMIN: any deed). EMPLOYEE can never delete. */
  async remove(id: string, user: StaffUser): Promise<void> {
    if (user.role === "EMPLOYEE") {
      throw new ForbiddenException("Employees cannot delete deeds.");
    }
    const existing = await this.prisma.deedTemplate.findUnique({ where: { id } });
    if (!existing || (user.role !== "ADMIN" && existing.createdById !== user.id)) {
      throw new NotFoundException("Sample deed not found.");
    }
    await this.prisma.deedTemplate.delete({ where: { id } });
  }
}
