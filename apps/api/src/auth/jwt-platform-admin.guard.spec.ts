import { describe, it, expect, vi } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JwtPlatformAdminGuard } from "./jwt-platform-admin.guard.js";

function fakeContext(headers: Record<string, string>): any {
  const req: any = { headers, user: undefined };
  return { switchToHttp: () => ({ getRequest: () => req }) };
}

function guardWith(opts: {
  payload?: unknown;
  verifyThrows?: boolean;
  user?: { status: string; role: string; tokenVersion: number; isPlatformAdmin: boolean } | null;
}) {
  const jwt = {
    verifyAsync: vi.fn(async () => {
      if (opts.verifyThrows) throw new Error("bad token");
      return opts.payload;
    }),
  } as any;
  const prisma = {
    user: { findUnique: vi.fn(async () => opts.user ?? null) },
    membership: { findFirst: vi.fn(async () => null) },
  } as any;
  const cls = { set: vi.fn() } as any;
  return new JwtPlatformAdminGuard(jwt, prisma, cls);
}

describe("JwtPlatformAdminGuard", () => {
  it("rejects requests with no bearer token", async () => {
    const guard = guardWith({});
    await expect(guard.canActivate(fakeContext({}))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an invalid/expired token", async () => {
    const guard = guardWith({ verifyThrows: true });
    await expect(guard.canActivate(fakeContext({ authorization: "Bearer x" }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a valid token for a user who isn't flagged isPlatformAdmin — this is the 403 a regular org ADMIN/staff account must get", async () => {
    const guard = guardWith({
      payload: { sub: "u1", email: "a@b.com", role: "ADMIN", tokenVersion: 0 },
      user: { status: "ACTIVE", role: "ADMIN", tokenVersion: 0, isPlatformAdmin: false },
    });
    await expect(guard.canActivate(fakeContext({ authorization: "Bearer x" }))).rejects.toThrow(ForbiddenException);
  });

  it("rejects a stale token whose tokenVersion no longer matches the live user row", async () => {
    const guard = guardWith({
      payload: { sub: "u1", email: "a@b.com", role: "ADMIN", tokenVersion: 0 },
      user: { status: "ACTIVE", role: "ADMIN", tokenVersion: 1, isPlatformAdmin: true },
    });
    await expect(guard.canActivate(fakeContext({ authorization: "Bearer x" }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a deactivated user even if isPlatformAdmin is still set", async () => {
    const guard = guardWith({
      payload: { sub: "u1", email: "a@b.com", role: "ADMIN", tokenVersion: 0 },
      user: { status: "INACTIVE", role: "ADMIN", tokenVersion: 0, isPlatformAdmin: true },
    });
    await expect(guard.canActivate(fakeContext({ authorization: "Bearer x" }))).rejects.toThrow(UnauthorizedException);
  });

  it("passes for a live, active, platform-admin-flagged user", async () => {
    const guard = guardWith({
      payload: { sub: "u1", email: "a@b.com", role: "ADMIN", tokenVersion: 0 },
      user: { status: "ACTIVE", role: "ADMIN", tokenVersion: 0, isPlatformAdmin: true },
    });
    await expect(guard.canActivate(fakeContext({ authorization: "Bearer x" }))).resolves.toBe(true);
  });
});
