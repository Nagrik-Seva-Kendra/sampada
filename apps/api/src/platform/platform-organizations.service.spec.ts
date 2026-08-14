import { describe, it, expect, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PlatformOrganizationsService } from "./platform-organizations.service.js";

/**
 * Security-boundary tests for the platform back-office (SAAS_HANDOFF.md rule
 * #7). Unlike every other service in this codebase, PlatformOrganizationsService
 * takes no ClsService / tenant context at all — it can only operate on the
 * `id`s the caller passes in, with no notion of "my org". These tests prove
 * that structurally: a fake Prisma double with two unrelated organizations
 * shows the service reads/writes org B while "acting as" a caller who has no
 * membership in org B whatsoever (there's nothing in this service that could
 * even express "caller's own org" — the HTTP-level 403 for non-platform-admins
 * is covered separately in jwt-platform-admin.guard.spec.ts).
 */
function fakePrisma(seed: {
  orgs: Record<string, { id: string; status: string }>;
  memberships: Array<{ id: string; organizationId: string; userId: string; role: string; status: string }>;
}) {
  const orgs: Record<string, any> = {};
  for (const [key, o] of Object.entries(seed.orgs)) {
    orgs[key] = { name: key, isPersonal: false, joinCode: `JC-${key}`, createdAt: new Date(), ...o };
  }
  const memberships = seed.memberships.map((m) => ({ createdAt: new Date(), employeeCode: null, ...m }));
  const users: Record<string, { id: string; tokenVersion: number }> = {};
  for (const m of memberships) users[m.userId] ??= { id: m.userId, tokenVersion: 0 };

  const client: any = {
    organization: {
      findMany: vi.fn(async ({ where }: any = {}) => {
        let rows = Object.values(orgs);
        if (where?.OR) rows = rows.filter((o: any) => o.name?.includes(where.OR[0].name?.contains ?? ""));
        return rows.map((o: any) => ({ ...o, _count: { memberships: memberships.filter((m) => m.organizationId === o.id).length } }));
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const o = orgs[where.id];
        if (!o) return null;
        return {
          ...o,
          memberships: memberships
            .filter((m) => m.organizationId === where.id)
            .map((m) => ({ ...m, user: { id: m.userId, fname: "F", lname: "L", email: `${m.userId}@x.com` } })),
        };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        orgs[where.id] = { ...orgs[where.id], ...data };
        return orgs[where.id];
      }),
    },
    membership: {
      findFirst: vi.fn(async ({ where }: any) =>
        memberships.find((m) => m.id === where.id && m.organizationId === where.organizationId) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any) => memberships.filter((m) => m.organizationId === where.organizationId)),
      update: vi.fn(async ({ where, data }: any) => {
        const m = memberships.find((x) => x.id === where.id)!;
        Object.assign(m, data);
        return m;
      }),
      count: vi.fn(
        async ({ where }: any) =>
          memberships.filter(
            (m) => m.organizationId === where.organizationId && m.role === where.role && m.status === where.status,
          ).length,
      ),
    },
    user: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        for (const id of where.id.in) {
          const u = (users[id] ??= { id, tokenVersion: 0 });
          if (data.tokenVersion?.increment) u.tokenVersion += data.tokenVersion.increment;
        }
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const u = (users[where.id] ??= { id: where.id, tokenVersion: 0 });
        if (data.tokenVersion?.increment) u.tokenVersion += data.tokenVersion.increment;
        return u;
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(client)),
  };
  // Deed counts are read through the unscoped client on purpose (this guard
  // puts the caller's own org in context, which would filter every other
  // organization's deeds to zero), so the fake has to expose it too.
  client.$unscoped = {
    deedTemplate: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
    },
  };
  return { client, users };
}

describe("PlatformOrganizationsService (cross-org access, no tenant context)", () => {
  it("reads an organization the 'caller' has no membership in at all", async () => {
    const { client } = fakePrisma({
      orgs: { orgB: { id: "orgB", status: "ACTIVE" } },
      memberships: [{ id: "m1", organizationId: "orgB", userId: "u1", role: "OWNER", status: "ACTIVE" }],
    });
    const service = new PlatformOrganizationsService(client);
    const detail = await service.getDetail("orgB");
    expect(detail.id).toBe("orgB");
    expect(detail.members).toHaveLength(1);
  });

  it("404s for an id that doesn't exist rather than leaking a filtered-empty result silently", async () => {
    const { client } = fakePrisma({ orgs: {}, memberships: [] });
    const service = new PlatformOrganizationsService(client);
    await expect(service.getDetail("nope")).rejects.toThrow(NotFoundException);
  });

  it("suspend() flips status and revokes every member's session for an org outside the caller's own membership", async () => {
    const { client, users } = fakePrisma({
      orgs: { orgB: { id: "orgB", status: "ACTIVE" } },
      memberships: [{ id: "m1", organizationId: "orgB", userId: "u1", role: "OWNER", status: "ACTIVE" }],
    });
    const service = new PlatformOrganizationsService(client);
    await service.suspend("orgB");
    expect(client.organization.update).toHaveBeenCalledWith({ where: { id: "orgB" }, data: { status: "SUSPENDED" } });
    expect(users["u1"]?.tokenVersion).toBe(1);
  });

  it("blocks demoting the last ACTIVE OWNER out of an org (invariant enforced platform-wide, not just self-service)", async () => {
    const { client } = fakePrisma({
      orgs: { orgB: { id: "orgB", status: "ACTIVE" } },
      memberships: [{ id: "m1", organizationId: "orgB", userId: "u1", role: "OWNER", status: "ACTIVE" }],
    });
    const service = new PlatformOrganizationsService(client);
    await expect(service.updateMembership("orgB", "m1", { status: "INACTIVE" })).rejects.toThrow(ConflictException);
  });

  it("allows demoting an OWNER when another ACTIVE OWNER remains", async () => {
    const { client } = fakePrisma({
      orgs: { orgB: { id: "orgB", status: "ACTIVE" } },
      memberships: [
        { id: "m1", organizationId: "orgB", userId: "u1", role: "OWNER", status: "ACTIVE" },
        { id: "m2", organizationId: "orgB", userId: "u2", role: "OWNER", status: "ACTIVE" },
      ],
    });
    const service = new PlatformOrganizationsService(client);
    const detail = await service.updateMembership("orgB", "m1", { status: "INACTIVE" });
    expect(detail.members.find((m) => m.membershipId === "m1")?.status).toBe("INACTIVE");
  });
});
