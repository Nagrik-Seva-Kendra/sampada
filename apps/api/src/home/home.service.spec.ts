import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HomeService } from "./home.service.js";

const ORG = "org-1";
const ctx = (role: string, userId = "u1") => ({ get: () => ({ userId, organizationId: ORG, membershipId: "m", role }) }) as any;

/** Counts / finds record their `where`; every model answers from a small canned table. */
function fakePrisma(opts: { rawFails?: boolean } = {}) {
  const calls: { model: string; op: string; where: any }[] = [];
  const counts: Record<string, number> = { draftIntake: 2, callbackRequest: 1, task: 3, followUp: 4, leaveRequest: 1, attendanceRecord: 2, membership: 3, deedTemplate: 1, colonySale: 0, archiveCopyRequest: 0 };
  const rows: Record<string, any[]> = {
    draftIntake: [{ id: "cmreq00000xyz123", customerName: "राम लाल", phone: "919876543210", workStatus: "NEW" }],
    deedTemplate: [{ id: "d1", title: "विक्रय पत्र राम लाल", type: "sale-deed" }],
    task: [{ id: "t1", number: 7, title: "राम लाल के कागज़", status: "OPEN" }],
    callbackRequest: [],
    colonyPlot: [{ id: "p1", block: "E", plotNo: "47", status: "SOLD", projectId: "pr1" }],
    colonyProject: [{ id: "pr1", name: "फ्लोरा सिटी" }],
  };
  const model = (name: string) => ({
    count: async (a: any) => (calls.push({ model: name, op: "count", where: a.where }), counts[name] ?? 0),
    findMany: async (a: any) => (calls.push({ model: name, op: "findMany", where: a.where }), rows[name] ?? []),
    findFirst: async () => (name === "user" ? { fname: "अनुज" } : null),
  });
  const names = ["draftIntake", "callbackRequest", "task", "followUp", "leaveRequest", "attendanceRecord", "membership", "deedTemplate", "colonySale", "archiveCopyRequest", "colonyPlot", "colonyProject", "user"];
  const p: any = Object.fromEntries(names.map((n) => [n, model(n)]));
  p.$unscoped = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      if (opts.rawFails) throw new Error("function similarity does not exist");
      calls.push({ model: "raw", op: strings.join("?"), where: vals });
      return rows.deedTemplate;
    }),
  };
  return { p, calls };
}

describe("HomeService.summary", () => {
  it("managers see the whole office, with attendance / leave / AI / colony / rating cards", async () => {
    const { p, calls } = fakePrisma();
    const s = await new HomeService(p, ctx("OWNER")).summary(new Date("2026-10-05T06:00:00Z"));
    expect(s.name).toBe("अनुज");
    expect(s.canManage).toBe(true);
    expect(s.cards.map((c) => c.key)).toEqual(
      expect.arrayContaining(["waNew", "callbacks", "registryToday", "registryTomorrow", "tasksToday", "attendance", "leavesPending", "followUps", "aiReview", "colonyDrafts", "copyRequests", "lowRatings"]),
    );
    expect(s.cards.find((c) => c.key === "attendance")).toMatchObject({ value: 2, total: 3, alert: true });
    expect(calls.filter((c) => c.op === "count").every((c) => !("assigneeId" in (c.where ?? {})))).toBe(true);
    const reg = calls.filter((c) => c.model === "draftIntake" && c.where.registryDate).map((c) => c.where.registryDate);
    expect(reg).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("other staff see only their own work and no office-wide cards", async () => {
    const { p, calls } = fakePrisma();
    const s = await new HomeService(p, ctx("EMPLOYEE", "emp1")).summary(new Date("2026-10-05T06:00:00Z"));
    expect(s.canManage).toBe(false);
    expect(s.cards.map((c) => c.key)).toEqual(["waNew", "callbacks", "registryToday", "registryTomorrow", "tasksToday"]);
    const mine = calls.filter((c) => c.op === "count" && c.model !== "followUp");
    expect(mine.every((c) => c.where.assigneeId === "emp1" && c.where.organizationId === ORG)).toBe(true);
    expect(calls.some((c) => ["leaveRequest", "attendanceRecord", "draftIntake"].includes(c.model) && c.where?.rating)).toBe(false);
  });

  it("a failing count shows 0 instead of breaking the page", async () => {
    const { p } = fakePrisma();
    p.colonySale.count = async () => {
      throw new Error("relation missing");
    };
    const s = await new HomeService(p, ctx("ADMIN")).summary();
    expect(s.cards.find((c) => c.key === "colonyDrafts")!.value).toBe(0);
  });
});

describe("HomeService.search", () => {
  it("needs 2 characters", async () => {
    const { p } = fakePrisma();
    await expect(new HomeService(p, ctx("OWNER")).search(" a ")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("finds requests (masked phone), deeds via trigram SQL scoped to the office, tasks", async () => {
    const { p, calls } = fakePrisma();
    const hits = await new HomeService(p, ctx("OWNER")).search("राम लाल");
    expect(hits.map((h) => h.kind)).toEqual(["request", "deed", "task"]);
    expect(hits[0]).toMatchObject({ to: "/whatsapp-requests/cmreq00000xyz123", subtitle: expect.stringContaining("****3210") });
    expect(hits[0]!.subtitle).not.toContain("9876543210");
    expect(hits[1]).toMatchObject({ to: "/deeds/sale-deed/edit/d1" });
    const raw = calls.find((c) => c.model === "raw")!;
    expect(raw.op).toContain('"organizationId" =');
    expect(raw.where[0]).toBe(ORG);
  });

  it("falls back to ILIKE when pg_trgm is missing; staff searches only their own requests", async () => {
    const { p, calls } = fakePrisma({ rawFails: true });
    const hits = await new HomeService(p, ctx("EMPLOYEE", "emp1")).search("3210");
    expect(hits.some((h) => h.kind === "deed")).toBe(true);
    const req = calls.find((c) => c.model === "draftIntake" && c.op === "findMany")!;
    expect(req.where).toMatchObject({ organizationId: ORG, assigneeId: "emp1" });
    expect(req.where.OR).toEqual(expect.arrayContaining([{ phone: { endsWith: "3210" } }]));
  });

  it("colony plot 'E-47' (Devanagari digits too)", async () => {
    const { p } = fakePrisma();
    const hits = await new HomeService(p, ctx("OWNER")).search("E-४७");
    expect(hits.find((h) => h.kind === "plot")).toMatchObject({ title: "फ्लोरा सिटी ब्लॉक E - प्लाट 47", to: "/colony" });
  });
});
