/**
 * Marking a deed as a starter pushes it into every existing workspace, and
 * unmarking it takes back the copies nobody used.
 *
 * The case that matters most is the last one: a copy a partner has already
 * worked on must survive us changing our mind about the template. Getting
 * that wrong destroys someone else's work silently, which is why it is
 * tested against a real database rather than a mock.
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @sampada/api exec \
 *     vitest run test/starter-fanout.e2e.spec.ts
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

describe.skipIf(!HAS_DB)("starter fan-out (e2e)", () => {
  const base = HAS_DB
    ? new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    : (undefined as unknown as PrismaClient);
  const cls = new FakeCls();
  const prisma = HAS_DB ? (Object.assign(base, { $unscoped: base }) as never) : (undefined as never);
  const service = HAS_DB ? new SampleDeedsService(prisma, cls as never) : (undefined as never);

  const suffix = randomUUID().slice(0, 8);
  const homeOrg = `fanout-home-${suffix}`;
  const partnerA = `fanout-a-${suffix}`;
  const partnerB = `fanout-b-${suffix}`;
  const starterId = randomUUID();

  const orgs = [homeOrg, partnerA, partnerB];

  beforeAll(async () => {
    for (const id of orgs) {
      await base.organization.create({
        data: { id, name: `Fanout ${id}`, slug: id, joinCode: id.slice(0, 12) },
      });
      const userId = `u-${id}`;
      await base.user.create({
        data: {
          id: userId,
          email: `${userId}@example.com`,
          username: userId,
          passwordHash: "x",
          role: "ADMIN",
          fname: "Owner",
          lname: id.slice(-8),
          status: "ACTIVE",
        },
      });
      await base.membership.create({
        data: { userId, organizationId: id, role: "OWNER", status: "ACTIVE" },
      });
    }

    await base.deedTemplate.create({
      data: {
        id: starterId,
        organizationId: homeOrg,
        type: "sale-deed",
        title: `Fanout starter ${suffix}`,
        content: "नमूना पाठ",
        status: "active",
        createdById: `u-${homeOrg}`,
        createdByName: "Owner",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    cls.set(TENANT_KEY, {
      userId: `u-${homeOrg}`,
      organizationId: homeOrg,
      membershipId: "m",
      role: "ADMIN",
    } as TenantContext);
  });

  afterAll(async () => {
    // Marking a starter reaches every organization in the database, so the
    // copies have to be cleaned up by where they came from, not by where this
    // test put its own orgs. A test that fails midway leaves copies sitting in
    // real workspaces otherwise.
    await base.deedTemplate.deleteMany({ where: { starterSourceId: starterId } });
    await base.deedTemplate.deleteMany({ where: { organizationId: { in: orgs } } });
    await base.membership.deleteMany({ where: { organizationId: { in: orgs } } });
    await base.user.deleteMany({ where: { id: { in: orgs.map((o) => `u-${o}`) } } });
    await base.organization.deleteMany({ where: { id: { in: orgs } } });
    await base.$disconnect();
  });

  it("reaches every existing workspace the moment it is marked", async () => {
    const result = await service.setStarter(starterId, true);
    expect(result.deed.isStarter).toBe(true);
    // Every other workspace on the platform, not only the two set up here.
    expect(result.addedCopies).toBeGreaterThanOrEqual(2);

    for (const org of [partnerA, partnerB]) {
      const copy = await base.deedTemplate.findFirst({
        where: { organizationId: org, starterSourceId: starterId },
      });
      expect(copy?.title).toBe(`Fanout starter ${suffix}`);
      // Attributed to that workspace's own owner, and not itself a starter.
      expect(copy?.createdById).toBe(`u-${org}`);
      expect(copy?.isStarter).toBe(false);
    }

    // The original stays put and is not duplicated into its own workspace.
    const atHome = await base.deedTemplate.count({ where: { organizationId: homeOrg } });
    expect(atHome).toBe(1);
  });

  it("does not copy again when it is marked a second time", async () => {
    const result = await service.setStarter(starterId, true);
    expect(result.addedCopies).toBe(0);
  });

  it("takes back the copies nobody used, and leaves the worked-on one alone", async () => {
    // Partner B gets to work: edit the body, which moves updatedAt.
    const bCopy = await base.deedTemplate.findFirstOrThrow({
      where: { organizationId: partnerB, starterSourceId: starterId },
    });
    await base.deedTemplate.update({
      where: { id: bCopy.id },
      data: { content: "श्री राम कुमार …", updatedAt: new Date(Date.now() + 1000) },
    });

    const result = await service.setStarter(starterId, false);
    expect(result.deed.isStarter).toBe(false);
    expect(result.keptWorkedOnCopies).toBeGreaterThanOrEqual(1);

    // A's untouched copy is gone; B's work survives.
    expect(
      await base.deedTemplate.count({ where: { organizationId: partnerA, starterSourceId: starterId } }),
    ).toBe(0);
    const survivor = await base.deedTemplate.findFirst({ where: { id: bCopy.id } });
    expect(survivor?.content).toBe("श्री राम कुमार …");
  });

  it("keeps an untouched copy that has a party attached to it", async () => {
    await service.setStarter(starterId, true);
    const aCopy = await base.deedTemplate.findFirstOrThrow({
      where: { organizationId: partnerA, starterSourceId: starterId },
    });

    // The body is untouched, but the partner has started attaching people to
    // it — deleting the deed would orphan that work.
    const party = await base.party.create({
      data: {
        organizationId: partnerA,
        name: "Test Party",
      },
    });
    await base.deedParty.create({
      data: { organizationId: partnerA, deedId: aCopy.id, partyId: party.id, role: "seller" },
    });

    await service.setStarter(starterId, false);
    expect(await base.deedTemplate.count({ where: { id: aCopy.id } })).toBe(1);

    await base.deedParty.deleteMany({ where: { deedId: aCopy.id } });
    await base.party.delete({ where: { id: party.id } });
  });
});
