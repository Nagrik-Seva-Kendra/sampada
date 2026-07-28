import { describe, it, expect, vi } from "vitest";
import { applyTenantScope } from "./tenant-scope.core.js";

const ORG = "org_A";
const clsWith = (orgId?: string) => ({
  get: () => (orgId ? { userId: "u", organizationId: orgId, membershipId: "m", role: "ADMIN" } : undefined),
});

function harness(orgId?: string) {
  const calls: any[] = [];
  const baseModel = {
    findFirst: vi.fn(async (args: any) => {
      calls.push(["base.findFirst", args]);
      return { id: "row1" };
    }),
    findFirstOrThrow: vi.fn(async (args: any) => {
      calls.push(["base.findFirstOrThrow", args]);
      return { id: "row1" };
    }),
  };
  const getBase = () => ({ deedTemplate: baseModel, party: baseModel, deedPropertyDetail: baseModel });
  const query = vi.fn(async (args: any) => {
    calls.push(["query", args]);
    return { ok: true, args };
  });
  return { calls, query, getBase, cls: clsWith(orgId), baseModel };
}

describe("tenant scope (deny-by-default)", () => {
  it("passes non-tenant models straight through", async () => {
    const h = harness(ORG);
    await applyTenantScope({ model: "User", operation: "findMany", args: { where: { email: "x" } }, ...h });
    expect(h.query).toHaveBeenCalledWith({ where: { email: "x" } });
  });

  it("throws on a tenant model with no org in context", async () => {
    const h = harness(undefined);
    await expect(
      applyTenantScope({ model: "DeedTemplate", operation: "findMany", args: {}, ...h }),
    ).rejects.toThrow(/no organization in context/);
    expect(h.query).not.toHaveBeenCalled();
  });

  it("injects organizationId into where on findMany", async () => {
    const h = harness(ORG);
    await applyTenantScope({ model: "DeedTemplate", operation: "findMany", args: { where: { type: "sale" } }, ...h });
    expect(h.query).toHaveBeenCalledWith({ where: { type: "sale", organizationId: ORG } });
  });

  it("rewrites findUnique to a scoped findFirst on the base client", async () => {
    const h = harness(ORG);
    await applyTenantScope({ model: "DeedTemplate", operation: "findUnique", args: { where: { id: "d1" } }, ...h });
    expect(h.baseModel.findFirst).toHaveBeenCalledWith({ where: { id: "d1", organizationId: ORG } });
    expect(h.query).not.toHaveBeenCalled(); // original findUnique never runs
  });

  it("stamps organizationId into data on create", async () => {
    const h = harness(ORG);
    await applyTenantScope({ model: "Party", operation: "create", args: { data: { name: "A" } }, ...h });
    expect(h.query).toHaveBeenCalledWith({ data: { name: "A", organizationId: ORG } });
  });

  it("stamps organizationId into every row on createMany", async () => {
    const h = harness(ORG);
    await applyTenantScope({ model: "Party", operation: "createMany", args: { data: [{ name: "A" }, { name: "B" }] }, ...h });
    expect(h.query).toHaveBeenCalledWith({ data: [{ name: "A", organizationId: ORG }, { name: "B", organizationId: ORG }] });
  });

  it("injects org into where on updateMany/deleteMany", async () => {
    const h = harness(ORG);
    await applyTenantScope({ model: "DeedTemplate", operation: "updateMany", args: { where: { type: "x" }, data: { status: "y" } }, ...h });
    expect(h.query).toHaveBeenCalledWith({ where: { type: "x", organizationId: ORG }, data: { status: "y" } });
  });

  it("verifies in-org before update, then runs the original op", async () => {
    const h = harness(ORG);
    await applyTenantScope({ model: "DeedTemplate", operation: "update", args: { where: { id: "d1" }, data: { title: "t" } }, ...h });
    expect(h.baseModel.findFirst).toHaveBeenCalledWith({ where: { id: "d1", organizationId: ORG }, select: { id: true } });
    expect(h.query).toHaveBeenCalledWith({ where: { id: "d1" }, data: { title: "t" } });
  });

  it("throws on update when the target is not in the caller's org", async () => {
    const h = harness(ORG);
    h.baseModel.findFirst.mockResolvedValueOnce(null as any); // target not found in org
    await expect(
      applyTenantScope({ model: "DeedTemplate", operation: "update", args: { where: { id: "other" }, data: {} }, ...h }),
    ).rejects.toThrow(/not found in the current organization/);
    expect(h.query).not.toHaveBeenCalled();
  });

  describe("soft delete (DeedPropertyDetail)", () => {
    it("injects deletedAt: null on findMany for a soft-delete model", async () => {
      const h = harness(ORG);
      await applyTenantScope({
        model: "DeedPropertyDetail",
        operation: "findMany",
        args: { where: { plotNo: "12" } },
        ...h,
      });
      expect(h.query).toHaveBeenCalledWith({
        where: { plotNo: "12", organizationId: ORG, deletedAt: null },
      });
    });

    it("rewrites findUnique to a scoped findFirst with deletedAt: null", async () => {
      const h = harness(ORG);
      await applyTenantScope({
        model: "DeedPropertyDetail",
        operation: "findUnique",
        args: { where: { deedId: "d1" } },
        ...h,
      });
      expect(h.baseModel.findFirst).toHaveBeenCalledWith({
        where: { deedId: "d1", organizationId: ORG, deletedAt: null },
      });
    });

    it("does not inject deletedAt for a model without the soft-delete convention", async () => {
      const h = harness(ORG);
      await applyTenantScope({
        model: "DeedTemplate",
        operation: "findMany",
        args: { where: { type: "sale" } },
        ...h,
      });
      expect(h.query).toHaveBeenCalledWith({ where: { type: "sale", organizationId: ORG } });
    });

    it("does not inject deletedAt on updateMany/deleteMany (soft delete is an explicit service-layer update)", async () => {
      const h = harness(ORG);
      await applyTenantScope({
        model: "DeedPropertyDetail",
        operation: "updateMany",
        args: { where: { plotNo: "12" }, data: { location: "x" } },
        ...h,
      });
      expect(h.query).toHaveBeenCalledWith({
        where: { plotNo: "12", organizationId: ORG },
        data: { location: "x" },
      });
    });
  });
});
