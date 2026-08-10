/**
 * The "All creators" filter must only ever name people from the caller's own
 * organization.
 *
 * This one is worth its own test because `User` is deliberately NOT a tenant
 * model — a person can belong to several organizations — so the Prisma
 * extension that guards every deed query cannot help here, and the filter has
 * to be written by hand. It was missed once already: the dropdown listed every
 * staff account on the platform, showing partners each other's names and
 * usernames.
 *
 * Needs a real Postgres, so it is skipped unless TEST_DATABASE_URL is set:
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @sampada/api exec \
 *     vitest run test/deed-creators-scope.e2e.spec.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SampleDeedsService } from "../src/deeds/sample-deeds.service.js";
import { TENANT_KEY, type TenantContext } from "../src/tenant/tenant-context.js";

const HAS_DB = !!process.env.TEST_DATABASE_URL;

class FakeCls {
  private store = new Map<string, unknown>();
  set(k: string, v: unknown) {
    this.store.set(k, v);
  }
  get(k: string) {
    return this.store.get(k);
  }
}

describe.skipIf(!HAS_DB)("deed creators are org-scoped (e2e)", () => {
  const base = HAS_DB
    ? new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    : (undefined as unknown as PrismaClient);
  const cls = new FakeCls();
  const service = HAS_DB
    ? new SampleDeedsService(base as never, cls as never)
    : (undefined as never);

  const suffix = randomUUID().slice(0, 8);
  const orgA = `creators-a-${suffix}`;
  const orgB = `creators-b-${suffix}`;
  const userA = `user-a-${suffix}`;
  const userB = `user-b-${suffix}`;

  const actAs = (organizationId: string) =>
    cls.set(TENANT_KEY, {
      userId: userA,
      organizationId,
      membershipId: "m",
      role: "ADMIN",
    } as TenantContext);

  beforeAll(async () => {
    for (const [id, who] of [
      [orgA, "A"],
      [orgB, "B"],
    ] as const) {
      await base.organization.create({
        data: { id, name: `Creators ${who} ${suffix}`, slug: id, joinCode: id.slice(0, 12) },
      });
    }
    for (const [id, org, name] of [
      [userA, orgA, "Alpha"],
      [userB, orgB, "Beta"],
    ] as const) {
      await base.user.create({
        data: {
          id,
          email: `${id}@example.com`,
          username: id,
          passwordHash: "x",
          role: "ADMIN",
          fname: name,
          lname: "Person",
          status: "ACTIVE",
        },
      });
      await base.membership.create({
        data: { userId: id, organizationId: org, role: "OWNER", status: "ACTIVE" },
      });
    }
  });

  afterAll(async () => {
    await base.membership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await base.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await base.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await base.$disconnect();
  });

  it("names its own members", async () => {
    actAs(orgA);
    const names = (await service.listCreators()).map((c) => c.name);
    expect(names).toContain(userA);
  });

  it("never names someone from another organization", async () => {
    actAs(orgA);
    expect((await service.listCreators()).map((c) => c.name)).not.toContain(userB);

    actAs(orgB);
    const fromB = (await service.listCreators()).map((c) => c.name);
    expect(fromB).toContain(userB);
    expect(fromB).not.toContain(userA);
  });
});
