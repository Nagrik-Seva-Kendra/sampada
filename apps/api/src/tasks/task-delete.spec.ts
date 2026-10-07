import { ForbiddenException, Logger, NotFoundException } from "@nestjs/common";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksService } from "./tasks.service.js";

beforeEach(() => {
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(Logger.prototype, level).mockImplementation((() => undefined) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function world(role: string, row: any = { id: "t1", number: 7, organizationId: "org-1", documentKey: null }) {
  const prisma: any = {
    task: {
      findFirst: vi.fn(async ({ where }: any) => (where.id === row.id && where.organizationId === "org-1" ? row : null)),
      delete: vi.fn(async () => row),
    },
  };
  const svc = new TasksService(prisma, { get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m", role }) } as any);
  return { prisma, svc };
}

describe("deleting a task (owner only)", () => {
  it("the owner deletes it for good, with its file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "task-del-"));
    vi.stubEnv("WA_MEDIA_DIR", dir);
    for (const k of ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) vi.stubEnv(k, "");
    const w = world("OWNER", { id: "t1", number: 7, organizationId: "org-1", documentKey: "tasks/org/t1.pdf" });
    expect(await w.svc.deleteWeb("t1")).toEqual({ ok: true });
    expect(w.prisma.task.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });

  it("admin and staff cannot; another organization's / unknown task is not found", async () => {
    for (const role of ["ADMIN", "EMPLOYEE"]) {
      const w = world(role);
      await expect(w.svc.deleteWeb("t1")).rejects.toBeInstanceOf(ForbiddenException);
      expect(w.prisma.task.delete).not.toHaveBeenCalled();
    }
    await expect(world("OWNER").svc.deleteWeb("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("the list tells the page who may delete", async () => {
    const list = async (role: string) => {
      const prisma: any = { task: { findMany: async () => [] }, user: { findMany: async () => [] } };
      return new TasksService(prisma, { get: () => ({ userId: "u1", organizationId: "org-1", membershipId: "m", role }) } as any).list({});
    };
    expect((await list("OWNER")).canDelete).toBe(true);
    expect((await list("ADMIN")).canDelete).toBe(false);
    expect((await list("EMPLOYEE")).canDelete).toBe(false);
  });
});
