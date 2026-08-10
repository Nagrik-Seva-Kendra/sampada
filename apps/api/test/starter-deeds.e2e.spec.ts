/**
 * Starter deeds are copied into a workspace at signup.
 *
 * Runs against a REAL Postgres + generated Prisma client, so it is skipped
 * unless TEST_DATABASE_URL is set — same contract as tenant-isolation.e2e.
 * Run locally:
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @sampada/api exec \
 *     vitest run test/starter-deeds.e2e.spec.ts
 *
 * The point of exercising the real service rather than the query in isolation
 * is the wiring: seeding happens on a public route with no tenant in context,
 * so it has to reach past the tenant-scoped client, and getting that wrong
 * fails at runtime rather than at compile time.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { OrganizationsService } from "../src/organizations/organizations.service.js";

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

describe.skipIf(!HAS_DB)("starter deeds (e2e)", () => {
  // Vitest runs a skipped describe's body during collection, so nothing here
  // may throw when TEST_DATABASE_URL is unset.
  const base = HAS_DB
    ? new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    : (undefined as unknown as PrismaClient);

  // The service only ever reaches the database through `$unscoped` for this
  // work, so the harness can hand it the raw client under that name.
  const prisma = HAS_DB
    ? (Object.assign(base, { $unscoped: base }) as unknown as ConstructorParameters<typeof OrganizationsService>[0])
    : (undefined as never);

  const service = HAS_DB
    ? new OrganizationsService(
        prisma,
        { assertVerified: () => undefined } as never,
        { assertStaffLoginAvailable: async () => undefined } as never,
        { issueSession: async (user: unknown) => ({ user }) } as never,
        new FakeCls() as never,
      )
    : (undefined as never);

  const suffix = randomUUID().slice(0, 8);
  const starterOrgId = `starter-src-${suffix}`;
  const starterDeedId = randomUUID();
  const decoyDeedId = randomUUID();
  let newOrgId = "";

  beforeAll(async () => {
    await base.organization.create({
      data: {
        id: starterOrgId,
        name: `Starter source ${suffix}`,
        slug: `starter-source-${suffix}`,
        joinCode: `SS${suffix.toUpperCase()}`,
      },
    });
    const common = {
      organizationId: starterOrgId,
      type: "sale-deed",
      content: "विक्रय विलेख — <विक्रेता का नाम>",
      status: "active",
      createdById: "seed-user",
      createdByName: "Seed User",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await base.deedTemplate.create({
      data: { ...common, id: starterDeedId, title: `Starter skeleton ${suffix}`, isStarter: true },
    });
    // A deed in the same organization that was never marked — it must not
    // travel with the starters.
    await base.deedTemplate.create({
      data: { ...common, id: decoyDeedId, title: `Ordinary deed ${suffix}`, isStarter: false },
    });
  });

  afterAll(async () => {
    if (newOrgId) {
      await base.deedTemplate.deleteMany({ where: { organizationId: newOrgId } });
      await base.membership.deleteMany({ where: { organizationId: newOrgId } });
      await base.user.deleteMany({ where: { lastActiveOrganizationId: newOrgId } });
      await base.organization.delete({ where: { id: newOrgId } });
    }
    await base.deedTemplate.deleteMany({ where: { organizationId: starterOrgId } });
    await base.organization.delete({ where: { id: starterOrgId } });
    await base.$disconnect();
  });

  it("copies the marked starters into a brand-new workspace", async () => {
    await service.signup({
      orgName: `Fresh partner ${suffix}`,
      fname: "Fresh",
      lname: "Partner",
      email: `fresh-${suffix}@example.com`,
      password: "Test1234@",
      emailOtp: "000000",
      onboardingRole: "writer",
      onboardingGoal: "deeds",
      district: "Gwalior",
    });

    const org = await base.organization.findFirst({ where: { name: `Fresh partner ${suffix}` } });
    expect(org).toBeTruthy();
    newOrgId = org!.id;

    const copies = await base.deedTemplate.findMany({ where: { organizationId: newOrgId } });
    // Asserted by title, not by count: whatever else the database has marked
    // as a starter is legitimately copied too, and a count would make this
    // test fail for reasons that have nothing to do with it.
    const copy = copies.find((d) => d.title === `Starter skeleton ${suffix}`);
    expect(copy).toBeTruthy();
    expect(copies.some((d) => d.title === `Ordinary deed ${suffix}`)).toBe(false);
    if (!copy) return;

    expect(copy.title).toBe(`Starter skeleton ${suffix}`);
    expect(copy.content).toBe("विक्रय विलेख — <विक्रेता का नाम>");
    // A fresh row, owned by the new workspace's founder.
    expect(copy.id).not.toBe(starterDeedId);
    expect(copy.createdByName).toBe("Fresh Partner");
    expect(copy.createdByRole).toBe("OWNER");
    // Not itself a starter: otherwise every partner's copy would be handed on
    // to the next partner who signs up.
    expect(copy.isStarter).toBe(false);
  });

  it("keeps the onboarding answers the wizard used to discard", async () => {
    const org = await base.organization.findUnique({ where: { id: newOrgId } });
    expect(org?.onboardingRole).toBe("writer");
    expect(org?.onboardingGoal).toBe("deeds");
    expect(org?.district).toBe("Gwalior");
  });

  it("leaves the source workspace untouched", async () => {
    const source = await base.deedTemplate.findMany({ where: { organizationId: starterOrgId } });
    expect(source).toHaveLength(2);
    expect(source.filter((d) => d.isStarter)).toHaveLength(1);
  });
});
