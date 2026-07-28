import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { MemberStatus, OrgRole, OrgStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertOrgKeepsActiveOwner } from "../organizations/organization-invariants.js";
import { LastOwnerViolationError } from "../organizations/organization-invariants.core.js";

export interface PlatformOrgFilters {
  search?: string;
  cursor?: string;
  limit: number;
}

/**
 * Platform-wide organization admin (Phase 5 "back-office" from
 * SAAS_HANDOFF.md). Every read/write here spans organizations the caller is
 * not necessarily a member of, so it goes through Organization/Membership/
 * User directly rather than any per-org-scoped service — none of those three
 * models are tenant-scoped (see tenant-scope.core.ts's TENANT_MODELS), so a
 * platform admin can read/act on any of them with the regular Prisma client.
 * Every route is gated by JwtPlatformAdminGuard in the controller.
 */
@Injectable()
export class PlatformOrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: PlatformOrgFilters) {
    const where: Prisma.OrganizationWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { slug: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {};
    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isPersonal: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    });
    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const lastRow = page[page.length - 1];
    return {
      data: page.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        isPersonal: r.isPersonal,
        memberCount: r._count.memberships,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: hasMore && lastRow ? lastRow.id : null,
    };
  }

  async getDetail(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isPersonal: true,
        joinCode: true,
        createdAt: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            status: true,
            employeeCode: true,
            createdAt: true,
            user: { select: { id: true, fname: true, lname: true, email: true } },
          },
        },
      },
    });
    if (!org) throw new NotFoundException("Organization not found.");
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      isPersonal: org.isPersonal,
      joinCode: org.joinCode,
      createdAt: org.createdAt.toISOString(),
      members: org.memberships.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        name: `${m.user.fname} ${m.user.lname}`.trim(),
        email: m.user.email,
        role: m.role,
        status: m.status,
        employeeCode: m.employeeCode,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  private async setOrgStatus(id: string, status: OrgStatus, revokeSessions: boolean) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!org) throw new NotFoundException("Organization not found.");
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id }, data: { status } });
      if (revokeSessions) {
        const members = await tx.membership.findMany({ where: { organizationId: id }, select: { userId: true } });
        await tx.user.updateMany({
          where: { id: { in: members.map((m) => m.userId) } },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    });
  }

  /** Reversible: blocks access immediately, recoverable via reactivate. */
  suspend(id: string) {
    return this.setOrgStatus(id, "SUSPENDED", true);
  }

  /** Restores a suspended (or trialing/past-due) org to normal access. */
  reactivate(id: string) {
    return this.setOrgStatus(id, "ACTIVE", false);
  }

  /** Terminal (same effect as the owner's own self-delete) — never a hard delete. */
  cancel(id: string) {
    return this.setOrgStatus(id, "CANCELLED", true);
  }

  async updateMembership(
    organizationId: string,
    membershipId: string,
    input: { role?: OrgRole; status?: MemberStatus },
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      select: { id: true, userId: true, role: true, status: true },
    });
    if (!membership) throw new NotFoundException("Member not found.");

    const nextRole = input.role ?? membership.role;
    const nextStatus = input.status ?? membership.status;
    const losesActiveOwner =
      membership.role === "OWNER" && membership.status === "ACTIVE" && (nextRole !== "OWNER" || nextStatus !== "ACTIVE");

    try {
      await this.prisma.$transaction(async (tx) => {
        if (losesActiveOwner) await assertOrgKeepsActiveOwner(tx, organizationId);
        await tx.membership.update({ where: { id: membershipId }, data: { role: nextRole, status: nextStatus } });
        if (nextStatus === "INACTIVE" && membership.status !== "INACTIVE") {
          // Deactivation revokes the member's existing sessions immediately.
          await tx.user.update({ where: { id: membership.userId }, data: { tokenVersion: { increment: 1 } } });
        }
      });
    } catch (err) {
      if (err instanceof LastOwnerViolationError) throw new ConflictException(err.message);
      throw err;
    }
    return this.getDetail(organizationId);
  }
}
