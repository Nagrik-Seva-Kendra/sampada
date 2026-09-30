import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException, ForbiddenException, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestMediaKeys } from "./wa-request-delete.js";
import type { DraftIntakeRow } from "./wa-requests.mapper.js";
import { WaRequestsService } from "./wa-requests.service.js";

const FILES = ["reg.pdf", "extra.jpg", "a1.jpg", "a0.jpg", "p1.jpg", "draft.pdf", "draft-old.pdf"];
let logged: string[] = [];
let dir = "";

beforeEach(async () => {
  logged = [];
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
  dir = await mkdtemp(join(tmpdir(), "wa-del-"));
  await mkdir(join(dir, "whatsapp", "drafts"), { recursive: true });
  for (const f of FILES) await writeFile(join(dir, "whatsapp", f.startsWith("draft") ? `drafts/${f}` : f), "x");
  vi.stubEnv("WA_MEDIA_DIR", dir);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

function row(over: Partial<DraftIntakeRow> & Record<string, unknown> = {}): DraftIntakeRow & { deedTemplateId: string | null } {
  return {
    id: "cmg1abcdefxyz123",
    organizationId: "org-1",
    phone: "919876543210",
    customerName: "राम",
    status: "SUBMITTED",
    step: "FINAL",
    data: {
      buyerName: "अमित शर्मा",
      extraDocs: ["whatsapp/org-1/extra.jpg"],
      docs: { registry: "whatsapp/org-1/reg.pdf", sanction: "later" },
      idPhotos: { buyer: { aadhaarFront: "whatsapp/org-1/a1.jpg", pan: "whatsapp/org-1/p1.jpg", aadhaarBack: "later" } },
      idFiles: ["whatsapp/org-1/a0.jpg", "whatsapp/org-1/a1.jpg"],
      draftReview: { key: "whatsapp/org-1/drafts/draft.pdf" },
    },
    deed: null,
    documentKey: "whatsapp/org-1/reg.pdf",
    needsStaff: false,
    workStatus: "DONE",
    assigneeId: "emp-1",
    staffNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deedTemplateId: "deed-1",
    ...over,
  } as any;
}

/** Rows of every table the delete may touch; deeds and other requests must survive. */
function world() {
  const t = {
    draftIntake: [row(), row({ id: "other-request-2", data: {}, documentKey: "whatsapp/org-1/other.pdf" }), row({ id: "orgtwo-request3", organizationId: "org-2" })],
    waNotification: [
      { id: "n1", draftIntakeId: "cmg1abcdefxyz123", template: { name: "x", document: { key: "whatsapp/org-1/drafts/draft-old.pdf" } } },
      { id: "n2", draftIntakeId: "cmg1abcdefxyz123", template: null },
      { id: "n3", draftIntakeId: "other-request-2", template: null },
    ],
    deedTemplate: [{ id: "deed-1", organizationId: "org-1" }],
    waContact: [{ phone: "919876543210" }],
  };
  const match = (r: any, w: any) => Object.entries(w).every(([k, v]) => r[k] === v);
  const prisma: any = {
    draftIntake: {
      findFirst: vi.fn(async ({ where }: any) => t.draftIntake.find((r) => match(r, where)) ?? null),
      deleteMany: vi.fn(async ({ where }: any) => ({ op: () => (t.draftIntake = t.draftIntake.filter((r) => !match(r, where))) })),
    },
    waNotification: {
      findMany: vi.fn(async ({ where }: any) => t.waNotification.filter((r) => match(r, where))),
      deleteMany: vi.fn(async ({ where }: any) => ({ op: () => (t.waNotification = t.waNotification.filter((r) => !match(r, where))) })),
    },
    $transaction: vi.fn(async (ops: Promise<{ op: () => void }>[]) => (await Promise.all(ops)).forEach((o) => o.op())),
  };
  return { t, prisma };
}
const as = (role: string, userId = "u-1", organizationId = "org-1") => ({ get: () => ({ userId, organizationId, membershipId: "m", role }) });
const svc = (prisma: any, role: string, org = "org-1") => new WaRequestsService(prisma, as(role, "u-1", org) as any, { list: async () => [] } as any);
const exists = (f: string) => stat(join(dir, "whatsapp", f)).then(() => true, () => false);

describe("which files belong to a request", () => {
  it("documents, extras, mortgage papers, ID photos (incl. retries) and draft PDFs -- whatsapp/ keys only", () => {
    const keys = requestMediaKeys(row(), [{ document: { key: "whatsapp/org-1/drafts/draft-old.pdf" } }, null, { document: { key: "guidelines/x.pdf" } }]);
    expect(keys.sort()).toEqual([
      "whatsapp/org-1/a0.jpg",
      "whatsapp/org-1/a1.jpg",
      "whatsapp/org-1/drafts/draft-old.pdf",
      "whatsapp/org-1/drafts/draft.pdf",
      "whatsapp/org-1/extra.jpg",
      "whatsapp/org-1/p1.jpg",
      "whatsapp/org-1/reg.pdf",
    ]);
  });
});

describe("DELETE /whatsapp/requests/:id", () => {
  it("OWNER/ADMIN: files, notifications and the row go; the deed, the contact and other requests stay", async () => {
    for (const role of ["OWNER", "ADMIN"]) {
      const { t, prisma } = world();
      if (role === "ADMIN") for (const f of FILES) await writeFile(join(dir, "whatsapp", f.startsWith("draft") ? `drafts/${f}` : f), "x");
      const out = await svc(prisma, role).remove("cmg1abcdefxyz123", " xyz123 ");
      expect(out).toEqual({ ref: "XYZ123", deedTemplateId: "deed-1", filesDeleted: 7 });
      for (const f of FILES) expect(await exists(f.startsWith("draft") ? `drafts/${f}` : f)).toBe(false);
      expect(t.draftIntake.map((r) => r.id)).toEqual(["other-request-2", "orgtwo-request3"]);
      expect(t.waNotification.map((n) => n.id)).toEqual(["n3"]);
      expect(t.deedTemplate).toEqual([{ id: "deed-1", organizationId: "org-1" }]);
      expect(t.waContact).toHaveLength(1);
    }
    expect(logged).toContain("request XYZ123 deleted from org org-1 by user u-1 role=OWNER (7 files)");
    const all = logged.join("\n");
    expect(all).not.toContain("अमित");
    expect(all).not.toContain("9876543210");
  });

  it("EMPLOYEE (even the assignee) → 403; another org → 404; wrong number → 400; nothing deleted", async () => {
    const { t, prisma } = world();
    await expect(new WaRequestsService(prisma, as("EMPLOYEE", "emp-1") as any, {} as any).remove("cmg1abcdefxyz123", "XYZ123")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc(prisma, "OWNER", "org-2").remove("cmg1abcdefxyz123", "XYZ123")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc(prisma, "OWNER").remove("cmg1abcdefxyz123", "XYZ124")).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc(prisma, "OWNER").remove("cmg1abcdefxyz123", "")).rejects.toBeInstanceOf(BadRequestException);
    expect(t.draftIntake).toHaveLength(3);
    expect(await exists("reg.pdf")).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("a file that cannot be deleted → error, and the DB is not touched (no partial delete)", async () => {
    const { t, prisma } = world();
    // A directory where a file is expected: unlink fails with EISDIR/EPERM (not ENOENT).
    await rm(join(dir, "whatsapp", "p1.jpg"));
    await mkdir(join(dir, "whatsapp", "p1.jpg"));
    await expect(svc(prisma, "OWNER").remove("cmg1abcdefxyz123", "XYZ123")).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(t.draftIntake).toHaveLength(3);
    expect(t.waNotification).toHaveLength(3);
    expect(logged.some((l) => l.includes("delete stopped, 1/7 files not deleted"))).toBe(true);
  });

  it("R2 failure (HTTP 500) → nothing deleted from the DB", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "a");
    vi.stubEnv("R2_ACCESS_KEY_ID", "k");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "s");
    vi.stubEnv("R2_BUCKET", "b");
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    const { WaRequestsService: Fresh } = await import("./wa-requests.service.js");
    const { t, prisma } = world();
    await expect(new Fresh(prisma, as("OWNER") as any, {} as any).remove("cmg1abcdefxyz123", "XYZ123")).rejects.toThrow("अनुरोध नहीं हटाया गया");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(t.draftIntake).toHaveLength(3);
    vi.unstubAllGlobals();
  });
});

describe("bulk delete", () => {
  it('needs "DELETE <count>"; deletes each, reports the ones it could not', async () => {
    const { t, prisma } = world();
    await expect(svc(prisma, "OWNER").removeMany(["cmg1abcdefxyz123", "other-request-2"], "DELETE 3")).rejects.toThrow("DELETE 2");
    expect(t.draftIntake).toHaveLength(3);
    await expect(new WaRequestsService(prisma, as("EMPLOYEE") as any, {} as any).removeMany(["cmg1abcdefxyz123"], "DELETE 1")).rejects.toBeInstanceOf(ForbiddenException);

    const out = await svc(prisma, "OWNER").removeMany(["cmg1abcdefxyz123", "other-request-2", "orgtwo-request3"], "delete 3");
    expect(out.deleted.map((d) => d.ref)).toEqual(["XYZ123", "UEST-2"]);
    expect(out.failed).toEqual([{ id: "orgtwo-request3", ref: "QUEST3", reason: "नहीं मिला" }]);
    expect(t.draftIntake.map((r) => r.id)).toEqual(["orgtwo-request3"]); // the other org's request stays
  });
});
