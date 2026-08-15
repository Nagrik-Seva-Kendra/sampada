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

export interface PartyDeedStat {
  partyId: string;
  partyName: string;
  organizationId: string;
  organizationName: string;
  deedCount: number;
  lastDeedAt: string | null;
}

export interface DeedStats {
  totals: { organizations: number; deeds: number; parties: number };
  organizations: OrgDeedStat[];
  members: MemberDeedStat[];
  parties: PartyDeedStat[];
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

    const parties = await this.partyStats(orgName);

    return {
      totals: {
        organizations: organizations.length,
        deeds: organizations.reduce((sum, o) => sum + o.deedCount, 0),
        parties: parties.length,
      },
      organizations,
      members,
      parties,
    };
  }

  /**
   * The people named in deeds — buyers, sellers, mortgagors — and how many
   * deeds each appears in.
   *
   * Carries the name and counts only. Party rows also hold Aadhaar and PAN
   * numbers, and there is no back-office question on this page that needs
   * them; leaving them out of the response means they cannot leak from a
   * screen, a screenshot or a browser cache.
   *
   * A party can be attached to one deed in more than one role, so the deed
   * ids are counted distinctly rather than by counting link rows.
   */
  private async partyStats(orgName: Map<string, string>): Promise<PartyDeedStat[]> {
    const db = this.prisma.$unscoped;
    const links = await db.deedParty.findMany({
      select: { deedId: true, partyId: true, organizationId: true },
    });
    if (links.length === 0) return [];

    const [parties, deeds] = await Promise.all([
      db.party.findMany({
        where: { id: { in: [...new Set(links.map((l) => l.partyId))] } },
        select: { id: true, name: true },
      }),
      db.deedTemplate.findMany({
        where: { id: { in: [...new Set(links.map((l) => l.deedId))] } },
        select: { id: true, createdAt: true },
      }),
    ]);
    const partyName = new Map(parties.map((p) => [p.id, p.name]));
    const deedCreatedAt = new Map(deeds.map((d) => [d.id, d.createdAt]));

    const byParty = new Map<string, { organizationId: string; deedIds: Set<string>; last: Date | null }>();
    for (const link of links) {
      let row = byParty.get(link.partyId);
      if (!row) {
        row = { organizationId: link.organizationId, deedIds: new Set(), last: null };
        byParty.set(link.partyId, row);
      }
      row.deedIds.add(link.deedId);
      const at = deedCreatedAt.get(link.deedId);
      if (at && (!row.last || at > row.last)) row.last = at;
    }

    return [...byParty.entries()]
      .map(([partyId, row]) => ({
        partyId,
        // A link can outlive the party row it points at (the deed id is a
        // plain column, with no foreign key), so never assume a name is there.
        partyName: partyName.get(partyId) ?? "—",
        organizationId: row.organizationId,
        organizationName: orgName.get(row.organizationId) ?? "—",
        deedCount: row.deedIds.size,
        lastDeedAt: row.last ? row.last.toISOString() : null,
      }))
      .sort((a, b) => b.deedCount - a.deedCount);
  }
}
