import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export interface OrgDeedStat {
  organizationId: string;
  organizationName: string;
  slug: string;
  status: string;
  memberCount: number;
  deedCount: number;
  lastDeedAt: string | null;
}

export interface MemberDeedStat {
  organizationId: string;
  organizationName: string;
  createdById: string;
  createdByName: string;
  deedCount: number;
  lastDeedAt: string | null;
}

export interface DeedStats {
  totals: { organizations: number; deeds: number };
  organizations: OrgDeedStat[];
  members: MemberDeedStat[];
}

/**
 * Platform back-office deed activity — "which org (and which person) is
 * actually creating deeds, and which is idle". Spans every organization, so
 * (like PlatformOrganizationsService) it is platform-admin-only, gated by
 * JwtPlatformAdminGuard in the controller.
 *
 * DeedTemplate IS a tenant-scoped model, so its counts MUST go through
 * `prisma.$unscoped` (the audited cross-tenant escape hatch — see
 * prisma.service.ts); the default scoped client would deny the query for
 * having no organizationId in context. Organization/Membership are not
 * tenant models, so those go through the regular client.
 */
@Injectable()
export class PlatformDeedStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<DeedStats> {
    const db = this.prisma.$unscoped;

    const [orgs, byOrg, byMember] = await Promise.all([
      db.organization.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          _count: { select: { memberships: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.deedTemplate.groupBy({
        by: ["organizationId"],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      db.deedTemplate.groupBy({
        by: ["organizationId", "createdById", "createdByName"],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);

    const perOrg = new Map(byOrg.map((r) => [r.organizationId, r]));
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));

    const organizations: OrgDeedStat[] = orgs
      .map((o) => {
        const c = perOrg.get(o.id);
        return {
          organizationId: o.id,
          organizationName: o.name,
          slug: o.slug,
          status: o.status,
          memberCount: o._count.memberships,
          deedCount: c?._count._all ?? 0,
          lastDeedAt: c?._max.createdAt ? c._max.createdAt.toISOString() : null,
        };
      })
      .sort((a, b) => b.deedCount - a.deedCount);

    const members: MemberDeedStat[] = byMember
      .map((r) => ({
        organizationId: r.organizationId,
        organizationName: orgName.get(r.organizationId) ?? "—",
        createdById: r.createdById,
        createdByName: r.createdByName,
        deedCount: r._count._all,
        lastDeedAt: r._max.createdAt ? r._max.createdAt.toISOString() : null,
      }))
      .sort((a, b) => b.deedCount - a.deedCount);

    return {
      totals: {
        organizations: organizations.length,
        deeds: organizations.reduce((sum, o) => sum + o.deedCount, 0),
      },
      organizations,
      members,
    };
  }
}
