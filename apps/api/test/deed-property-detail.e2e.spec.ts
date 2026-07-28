/**
 * Phase 3 — DeedPropertyDetailService integration tests against a REAL
 * Postgres + generated Prisma client (Decimal round-tripping and upsert
 * semantics are exactly the kind of thing that's easy to get subtly wrong
 * with a mocked client). Skipped unless TEST_DATABASE_URL is set:
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @sampada/api exec \
 *     vitest run test/deed-property-detail.e2e.spec.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import { tenantScopeExtension } from "../src/prisma/tenant-scope.extension.js";
import { TENANT_KEY, type TenantContext } from "../src/tenant/tenant-context.js";
import { DeedPropertyDetailService } from "../src/deeds/deed-property-detail.service.js";

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

describe.skipIf(!HAS_DB)("DeedPropertyDetailService (e2e)", () => {
  const base = HAS_DB
    ? new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    : (undefined as unknown as PrismaClient);
  const cls = new FakeCls();
  const prisma = HAS_DB ? base.$extends(tenantScopeExtension(cls as any, () => base)) : (undefined as any);
  const service = HAS_DB ? new DeedPropertyDetailService(prisma as unknown as PrismaService) : (undefined as any);

  let orgId = "";
  let deedId = "";
  let otherDeedId = "";

  const boundaries = { north: "Plot 12", south: "Road", east: "Plot 14", west: "Plot 10" };
  const validInput = {
    plotNo: "12",
    location: "Gwalior",
    shape: "rectangle" as const,
    ewLength: 33.5,
    nsLength: 47.25,
    unit: "ft" as const,
    boundaries,
  };

  beforeAll(async () => {
    const org = await base.organization.create({
      data: { name: "PD Test", slug: `pd-${Date.now()}`, joinCode: `PD${Date.now()}` },
    });
    orgId = org.id;
    const now = new Date();
    deedId = `pd-deed-${Date.now()}`;
    otherDeedId = `pd-deed-other-${Date.now()}`;
    await base.deedTemplate.createMany({
      data: [
        { id: deedId, type: "sale", title: "Deed", content: "x", createdById: "x", createdByName: "x", createdAt: now, organizationId: orgId },
        { id: otherDeedId, type: "sale", title: "Other deed", content: "x", createdById: "x", createdByName: "x", createdAt: now, organizationId: orgId },
      ],
    });
    cls.set(TENANT_KEY, { userId: "u", organizationId: orgId, membershipId: "m", role: "ADMIN" } as TenantContext);
  });

  afterAll(async () => {
    await base.deedPropertyDetail.deleteMany({ where: { organizationId: orgId } });
    await base.deedTemplate.deleteMany({ where: { organizationId: orgId } });
    await base.organization.delete({ where: { id: orgId } });
    await base.$disconnect();
  });

  it("get() returns null when no property detail exists yet", async () => {
    const result = await service.get(otherDeedId);
    expect(result).toBeNull();
  });

  it("upsert() creates a new row and round-trips Decimal measurements exactly", async () => {
    const result = await service.upsert(deedId, validInput);
    expect(result.deedId).toBe(deedId);
    expect(result.plotNo).toBe("12");
    expect(result.ewLength).toBe(33.5);
    expect(result.nsLength).toBe(47.25);
    expect(result.unit).toBe("ft");
    expect(result.boundaries).toEqual(boundaries);
    expect(result.source).toBe("manual");
    expect(result.verifiedAt).toBeNull();
  });

  it("get() returns the upserted row", async () => {
    const result = await service.get(deedId);
    expect(result?.plotNo).toBe("12");
    expect(result?.ewLength).toBe(33.5);
  });

  it("upsert() updates the existing row instead of creating a second one", async () => {
    await service.upsert(deedId, { ...validInput, plotNo: "12-A", ewLength: 40 });
    const result = await service.get(deedId);
    expect(result?.plotNo).toBe("12-A");
    expect(result?.ewLength).toBe(40);

    const count = await base.deedPropertyDetail.count({ where: { deedId } });
    expect(count).toBe(1);
  });

  it("upsert() round-trips a decimal statedArea exactly", async () => {
    const result = await service.upsert(deedId, { ...validInput, statedArea: 1580.75, statedAreaUnit: "sqft" as const });
    expect(result.statedArea).toBe(1580.75);
    expect(result.statedAreaUnit).toBe("sqft");
  });

  it("upsert() throws NotFoundException for a deed that doesn't exist", async () => {
    await expect(service.upsert("no-such-deed", validInput)).rejects.toThrow(/Deed not found/);
  });

  it("remove() soft-deletes so get() returns null again", async () => {
    await service.remove(deedId);
    const result = await service.get(deedId);
    expect(result).toBeNull();

    const raw = await base.deedPropertyDetail.findUnique({ where: { deedId } });
    expect(raw?.deletedAt).not.toBeNull();
  });

  it("remove() throws NotFoundException when there's nothing to remove", async () => {
    await expect(service.remove(otherDeedId)).rejects.toThrow(/No property detail/);
  });
});
