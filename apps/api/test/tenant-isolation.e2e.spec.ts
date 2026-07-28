/**
 * Phase 1e — Tenant isolation integration tests (MANDATORY gate before Phase 2).
 *
 * These run against a REAL Postgres + generated Prisma client, so they are
 * skipped unless TEST_DATABASE_URL is set. Run locally:
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @sampada/api exec \
 *     vitest run test/tenant-isolation.e2e.spec.ts
 *
 * The pure scoping logic is already covered by src/prisma/tenant-scope.core.spec.ts
 * (no DB needed); this file proves the extension enforces isolation end-to-end
 * against the actual database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantScopeExtension } from "../src/prisma/tenant-scope.extension.js";
import { TENANT_KEY, type TenantContext } from "../src/tenant/tenant-context.js";

const HAS_DB = !!process.env.TEST_DATABASE_URL;

// Minimal in-memory stand-in for ClsService for the test harness.
class FakeCls {
  private store = new Map<string, unknown>();
  set(k: string, v: unknown) { this.store.set(k, v); }
  get(k: string) { return this.store.get(k); }
}

describe.skipIf(!HAS_DB)("tenant isolation (e2e)", () => {
  // Vitest still runs a skipped describe's body during collection, so this
  // constructor must not throw when TEST_DATABASE_URL is unset — otherwise
  // `skipIf` never gets a chance to actually skip anything.
  const base = HAS_DB
    ? new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    : (undefined as unknown as PrismaClient);
  const cls = new FakeCls();
  const prisma = HAS_DB ? base.$extends(tenantScopeExtension(cls as any, () => base)) : (undefined as any);

  const setOrg = (organizationId: string) =>
    cls.set(TENANT_KEY, { userId: "u", organizationId, membershipId: "m", role: "ADMIN" } as TenantContext);

  let orgA = "";
  let orgB = "";
  let deedA = "";
  let deedB = "";

  const boundaries = { boundaryNorth: "N", boundarySouth: "S", boundaryEast: "E", boundaryWest: "W" };

  beforeAll(async () => {
    const a = await base.organization.create({ data: { name: "A", slug: `a-${Date.now()}`, joinCode: `A${Date.now()}` } });
    const b = await base.organization.create({ data: { name: "B", slug: `b-${Date.now()}`, joinCode: `B${Date.now()}` } });
    orgA = a.id; orgB = b.id;
    const now = new Date();
    deedA = `dA-${Date.now()}`;
    deedB = `dB-${Date.now()}`;
    await base.deedTemplate.create({ data: { id: deedA, type: "sale", title: "A deed", content: "x", createdById: "x", createdByName: "x", createdAt: now, organizationId: orgA } });
    await base.deedTemplate.create({ data: { id: deedB, type: "sale", title: "B deed", content: "x", createdById: "x", createdByName: "x", createdAt: now, organizationId: orgB } });
  });

  afterAll(async () => {
    await base.deedPropertyDetail.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await base.deedTemplate.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await base.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await base.$disconnect();
  });

  it("throws when a tenant model is queried with no org in context", async () => {
    cls.set(TENANT_KEY, undefined);
    await expect(prisma.deedTemplate.findMany()).rejects.toThrow(/no organization in context/);
  });

  it("Org A sees only its own deeds", async () => {
    setOrg(orgA);
    const deeds = await prisma.deedTemplate.findMany();
    expect(deeds.every((d: any) => d.organizationId === orgA)).toBe(true);
    expect(deeds.some((d: any) => d.title === "B deed")).toBe(false);
  });

  it("Org A cannot read Org B's deed by id (findUnique is scoped)", async () => {
    setOrg(orgB);
    const [bDeed] = await prisma.deedTemplate.findMany();
    setOrg(orgA);
    const leaked = await prisma.deedTemplate.findUnique({ where: { id: bDeed.id } });
    expect(leaked).toBeNull();
  });

  it("Org A cannot update Org B's deed", async () => {
    setOrg(orgB);
    const [bDeed] = await prisma.deedTemplate.findMany();
    setOrg(orgA);
    await expect(
      prisma.deedTemplate.update({ where: { id: bDeed.id }, data: { title: "hacked" } }),
    ).rejects.toThrow(/not found in the current organization/);
  });

  it("switching orgs changes the visible result set", async () => {
    setOrg(orgA);
    const a = await prisma.deedTemplate.findMany();
    setOrg(orgB);
    const b = await prisma.deedTemplate.findMany();
    expect(a.map((d: any) => d.id).sort()).not.toEqual(b.map((d: any) => d.id).sort());
  });

  describe("DeedPropertyDetail", () => {
    it("Org A cannot read Org B's property detail by deedId", async () => {
      setOrg(orgB);
      await prisma.deedPropertyDetail.create({
        data: { deedId: deedB, plotNo: "B-1", location: "B City", ewLength: 40, nsLength: 60, unit: "ft", ...boundaries },
      });

      setOrg(orgA);
      const leaked = await prisma.deedPropertyDetail.findUnique({ where: { deedId: deedB } });
      expect(leaked).toBeNull();
      const list = await prisma.deedPropertyDetail.findMany();
      expect(list.some((r: any) => r.deedId === deedB)).toBe(false);
    });

    it("Org A cannot update Org B's property detail", async () => {
      setOrg(orgA);
      await expect(
        prisma.deedPropertyDetail.update({ where: { deedId: deedB }, data: { plotNo: "hacked" } }),
      ).rejects.toThrow(/not found in the current organization/);
    });

    it("a soft-deleted row (deletedAt set) is excluded from findMany/findUnique", async () => {
      setOrg(orgA);
      await prisma.deedPropertyDetail.create({
        data: { deedId: deedA, plotNo: "A-1", location: "A City", ewLength: 30, nsLength: 30, unit: "ft", ...boundaries },
      });
      await base.deedPropertyDetail.update({ where: { deedId: deedA }, data: { deletedAt: new Date() } });

      const found = await prisma.deedPropertyDetail.findUnique({ where: { deedId: deedA } });
      expect(found).toBeNull();
      const list = await prisma.deedPropertyDetail.findMany();
      expect(list.some((r: any) => r.deedId === deedA)).toBe(false);
    });
  });
});
