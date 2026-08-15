import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { MemberStatus, OrgRole, OrgStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertOrgKeepsActiveOwner } from "../organizations/organization-invariants.js";
import { LastOwnerViolationError } from "../organizations/organization-invariants.core.js";

export interface PlatformOrgFilters {
  search?: string;
  /** Exact district name, as stored from onboarding. */
  district?: string;
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
    const where: Prisma.OrganizationWhereInput = {
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { slug: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filters.district ? { district: filters.district } : {}),
    };
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
        district: true,
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
        district: r.district,
        memberCount: r._count.memberships,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: hasMore && lastRow ? lastRow.id : null,
    };
  }

  /**
   * One organization's deeds, newest first — the same list the partner sees in
   * their own workspace, read from the outside.
   *
   * Paged by cursor rather than returned whole: the largest workspace is past
   * eight thousand deeds, and the body is never selected here (one deed runs
   * to ~30KB, so a full page of bodies would be megabytes for a table that
   * shows titles).
   *
   * Unscoped deliberately — the platform guard puts the *caller's*
   * organization in context, so the scoped client would return the wrong
   * organization's deeds, or none.
   */
  async deeds(organizationId: string, cursor: string | undefined, limit: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException("Organization not found.");

    const rows = await this.prisma.$unscoped.deedTemplate.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdByName: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const lastRow = page[page.length - 1];
    return {
      data: page.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        status: d.status,
        createdByName: d.createdByName,
        createdAt: d.createdAt.toISOString(),
      })),
      nextCursor: hasMore && lastRow ? lastRow.id : null,
    };
  }

  /**
   * One deed of one organization, body included — what the back office opens
   * when someone needs to see what a partner actually wrote.
   *
   * The organization id is part of the lookup rather than trusted from the
   * deed: it means a deed id from one partner cannot be read by asking under
   * another partner's page, and a mistyped pair reads as absent instead of
   * quietly returning somebody else's document.
   */
  async deed(organizationId: string, deedId: string) {
    const row = await this.prisma.$unscoped.deedTemplate.findFirst({
      where: { id: deedId, organizationId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        content: true,
        createdByName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) throw new NotFoundException("Deed not found.");
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Districts that actually have partners in them, with how many, for the
   * filter control. Built from the data rather than from the full list of 52
   * Madhya Pradesh districts, so the dropdown never offers a choice that
   * returns nothing.
   */
  async districts(): Promise<{ district: string; count: number }[]> {
    const rows = await this.prisma.organization.groupBy({
      by: ["district"],
      where: { district: { not: null } },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({ district: r.district as string, count: r._count._all }))
      .sort((a, b) => a.district.localeCompare(b.district));
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
        district: true,
        onboardingRole: true,
        onboardingGoal: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            status: true,
            employeeCode: true,
            createdAt: true,
            user: { select: { id: true, fname: true, lname: true, email: true, mobile: true } },
          },
        },
      },
    });
    if (!org) throw new NotFoundException("Organization not found.");

    // Whether the workspace is actually being used is the first thing anyone
    // opening this page wants to know, and it isn't answerable from the
    // membership list alone.
    //
    // Unscoped deliberately: DeedTemplate is a tenant model, and this guard
    // puts the *caller's* organization in context — so the scoped client would
    // quietly filter every other organization's deeds away and report zero for
    // all of them. The organization being counted is named explicitly here.
    const [deedCount, newest] = await Promise.all([
      this.prisma.$unscoped.deedTemplate.count({ where: { organizationId: id } }),
      this.prisma.$unscoped.deedTemplate.findFirst({
        where: { organizationId: id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      isPersonal: org.isPersonal,
      joinCode: org.joinCode,
      createdAt: org.createdAt.toISOString(),
      district: org.district,
      onboardingRole: org.onboardingRole,
      onboardingGoal: org.onboardingGoal,
      deedCount,
      lastDeedAt: newest?.createdAt.toISOString() ?? null,
      members: org.memberships.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        name: `${m.user.fname} ${m.user.lname}`.trim(),
        email: m.user.email,
        role: m.role,
        status: m.status,
        mobile: m.user.mobile,
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
