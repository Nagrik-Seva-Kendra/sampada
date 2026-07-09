import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DeedType } from "@sampada/shared";
import type {
  CreateSampleDeedInput,
  DeedCreator,
  ListDeedsQuery,
  SampleDeedItem,
  SampleDeedListItem,
  UpdateSampleDeedInput,
} from "@sampada/shared";
import type { StaffUser } from "../auth/jwt-staff.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { DeedTemplate, Prisma } from "@prisma/client";

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
 * Every column except `content`. Lists must never select it: one deed body runs
 * to 30KB, so a full deed type (sale-deed: ~5.8k rows) would serialize ~40MB
 * and exhaust the API's memory. Callers fetch the body per-deed via getOne().
 */
const LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  status: true,
  createdById: true,
  createdByName: true,
  createdByRole: true,
  createdAt: true,
} as const;

type ListRow = Omit<DeedTemplate, "content" | "updatedAt">;

function toListItem(row: ListRow): SampleDeedListItem {
  return {
    id: row.id,
    type: row.type as DeedType,
    title: row.title,
    status: row.status as SampleDeedListItem["status"],
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdByRole: (row.createdByRole ?? undefined) as SampleDeedListItem["createdByRole"],
    createdAt: row.createdAt.toISOString(),
  };
}

/** Inclusive end-of-day: a `dateTo` of "2026-07-09" should include everything that day. */
function endOfDay(isoDate: string): Date {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Example deeds shown on a deed-type's public info page. Any staff member
 * (admin or employee) can draft their own; ADMIN additionally sees everyone's.
 * Backed by the DeedTemplate table.
 */
@Injectable()
export class SampleDeedsService {
  constructor(private readonly prisma: PrismaService) {}

  /** ADMIN and EMPLOYEE see every deed of this type; either may draft their own. Newest first. */
  async listByType(type: DeedType, user: StaffUser): Promise<SampleDeedListItem[]> {
    const canViewAll = user.role === "ADMIN" || user.role === "EMPLOYEE";
    const rows = await this.prisma.deedTemplate.findMany({
      where: canViewAll ? { type } : { type, createdById: user.id },
      orderBy: { createdAt: "desc" },
      select: LIST_SELECT,
    });
    return rows.map(toListItem);
  }

  /**
   * ADMIN/EMPLOYEE: every sample deed across every type (all creators),
   * newest first — powers the "All Deeds" management page. Filters combine
   * (AND); all are optional. Drops the heavy content body to keep it light.
   */
  async listAll(query: ListDeedsQuery): Promise<SampleDeedListItem[]> {
    const where: Prisma.DeedTemplateWhereInput = {
      ...(query.types?.length ? { type: { in: query.types } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
              ...(query.dateTo ? { lt: endOfDay(query.dateTo) } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.deedTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: LIST_SELECT,
    });
    return rows.map(toListItem);
  }

  /** Distinct creators with at least one deed, for the "All Deeds" creator filter dropdown. */
  async listCreators(): Promise<DeedCreator[]> {
    const rows = await this.prisma.deedTemplate.findMany({
      distinct: ["createdById"],
      select: { createdById: true, createdByName: true },
      orderBy: { createdByName: "asc" },
    });
    return rows.map((r) => ({ id: r.createdById, name: r.createdByName }));
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
