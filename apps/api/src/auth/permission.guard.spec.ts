import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { PermissionGuard } from "./permission.guard.js";

function fakeContext(): any {
  return { getHandler: () => ({}), getClass: () => ({}) };
}

function guardWith(required: string[] | undefined, tenant: unknown) {
  const reflector = { getAllAndOverride: vi.fn(() => required) } as any;
  const cls = { get: vi.fn(() => tenant) } as any;
  return new PermissionGuard(reflector, cls);
}

describe("PermissionGuard", () => {
  it("passes through when no @RequirePermission metadata is set", () => {
    const guard = guardWith(undefined, undefined);
    expect(guard.canActivate(fakeContext())).toBe(true);
  });

  it("throws when metadata is set but there's no tenant context", () => {
    const guard = guardWith(["members.invite"], undefined);
    expect(() => guard.canActivate(fakeContext())).toThrow(ForbiddenException);
  });

  it("throws for the public share-link sentinel", () => {
    const guard = guardWith(["members.invite"], {
      userId: "public",
      organizationId: "o1",
      membershipId: "public",
      role: "EMPLOYEE",
    });
    expect(() => guard.canActivate(fakeContext())).toThrow(ForbiddenException);
  });

  it("throws when the role lacks the permission", () => {
    const guard = guardWith(["members.invite"], {
      userId: "u1",
      organizationId: "o1",
      membershipId: "m1",
      role: "EMPLOYEE",
    });
    expect(() => guard.canActivate(fakeContext())).toThrow(ForbiddenException);
  });

  it("passes when the role has the permission", () => {
    const guard = guardWith(["members.invite"], {
      userId: "u1",
      organizationId: "o1",
      membershipId: "m1",
      role: "ADMIN",
    });
    expect(guard.canActivate(fakeContext())).toBe(true);
  });

  it("requires ALL permissions (AND) — throws on partial match", () => {
    const guard = guardWith(["members.invite", "org.ownershipTransfer"], {
      userId: "u1",
      organizationId: "o1",
      membershipId: "m1",
      role: "ADMIN",
    });
    expect(() => guard.canActivate(fakeContext())).toThrow(ForbiddenException);
  });

  it("passes when all required permissions are held", () => {
    const guard = guardWith(["members.invite", "org.ownershipTransfer"], {
      userId: "u1",
      organizationId: "o1",
      membershipId: "m1",
      role: "OWNER",
    });
    expect(guard.canActivate(fakeContext())).toBe(true);
  });
});
