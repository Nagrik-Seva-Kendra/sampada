import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerAssistantService } from "./owner-assistant.service.js";
import { isWeeklyReportAsk, weeklyDue, weeklyReportText, type WeeklyStats } from "./weekly-report.js";
import { WeeklyReportService } from "./weekly-report.service.js";

let logged: string[] = [];
beforeEach(() => {
  logged = [];
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org1");
  vi.stubEnv("WA_OWNER_NUMBERS", "919999900000");
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const STATS: WeeklyStats = {
  writers: 42,
  newRequests: 7,
  done: 5,
  ratings: { count: 3, avg: 4.666 },
  questions: { asked: 4, answered: 3, open: 1 },
  learnedUsed: 2,
  nudges: 6,
  staff: [
    { name: "मुस्कान मिश्रा", open: 3, overdue: 1 },
    { name: "बिना नाम", open: 1, overdue: 0 },
  ],
};

describe("weekly report", () => {
  it.each(["हफ़्ते की रिपोर्ट", "hafte ki report", "weekly report", "साप्ताहिक रिपोर्ट"])("%s asks the report", (t) => expect(isWeeklyReportAsk(t)).toBe(true));
  it.each(["रिपोर्ट", "मुस्कान की रिपोर्ट बनाओ", "report"])("%s is not the weekly report", (t) => expect(isWeeklyReportAsk(t)).toBe(false));

  it("due Monday from 09:30 IST, once", () => {
    const mon0930 = new Date("2026-10-12T04:00:00Z"); // Mon 09:30 IST
    expect(weeklyDue(new Date("2026-10-12T03:59:00Z"), null)).toBe(false);
    expect(weeklyDue(mon0930, null)).toBe(true);
    expect(weeklyDue(new Date("2026-10-12T08:00:00Z"), mon0930)).toBe(false);
    expect(weeklyDue(new Date("2026-10-13T04:00:00Z"), null)).toBe(false); // Tuesday
    expect(weeklyDue(new Date("2026-10-19T04:00:00Z"), mon0930)).toBe(true);
  });

  it("the text: customers, questions, staff", () => {
    const t = weeklyReportText(STATS, "❓ खुले सवाल (1):\n#4 ...");
    expect(t).toContain("बॉट पर लिखने वाले नंबर: 42");
    expect(t).toContain("नए अनुरोध (कागज़ भेजे): 7");
    expect(t).toContain("काम पूरे हुए: 5");
    expect(t).toContain("रेटिंग: 4.7 ⭐ (3 ग्राहक)");
    expect(t).toContain("अधूरे ग्राहकों को याद दिलाया: 6");
    expect(t).toContain("बॉट जवाब नहीं दे पाया: 4 (आपने जवाब दिया: 3)");
    expect(t).toContain("#4 ...");
    expect(t).toContain("मुस्कान मिश्रा: 3 (1 देर से)");
    expect(weeklyReportText({ ...STATS, staff: [], ratings: { count: 0, avg: null } }, null)).toContain("कोई काम बाकी नहीं ✅");
  });
});

function world() {
  const runs = new Map<string, Date>();
  const prisma: any = {
    waJobRun: {
      findUnique: async ({ where }: any) => (runs.has(where.name) ? { name: where.name, lastRunAt: runs.get(where.name) } : null),
      create: async ({ data }: any) => {
        if (runs.has(data.name)) throw new Error("exists");
        runs.set(data.name, data.lastRunAt);
      },
      updateMany: async ({ where, data }: any) => {
        if (runs.get(where.name)?.getTime() !== where.lastRunAt.getTime()) return { count: 0 };
        runs.set(where.name, data.lastRunAt);
        return { count: 1 };
      },
    },
    waContact: { count: vi.fn(async ({ where }: any) => (where.leadNudgedAt ? 6 : 42)), findUnique: async () => null },
    draftIntake: {
      count: async ({ where }: any) => (where.workStatus === "DONE" ? 5 : 7),
      aggregate: async () => ({ _avg: { rating: 4.5 }, _count: { rating: 2 } }),
    },
    waQuestion: { count: async ({ where }: any) => (where.status ? 0 : where.answeredAt ? 3 : 4) },
    waLearnedAnswer: { aggregate: async () => ({ _sum: { uses: 2 } }) },
  };
  const tasks: any = {
    openTasks: async () => [
      { assigneeId: "u1", dueAt: new Date("2026-10-01T00:00:00Z") },
      { assigneeId: "u1", dueAt: null },
      { assigneeId: null, dueAt: null },
    ],
    userNames: async () => new Map([["u1", "मुस्कान मिश्रा"]]),
  };
  const sent: { to: string; text: string }[] = [];
  const outbox: any = { deliverDirect: vi.fn(async (to: string, text: string) => sent.push({ to, text })) };
  return { prisma, tasks, outbox, sent, svc: new WeeklyReportService(prisma, tasks, outbox) };
}

describe("the Monday job and the owner's command", () => {
  it("sends once on Monday morning to the owner, from the database counts", async () => {
    const w = world();
    const mon = new Date("2026-10-12T04:05:00Z");
    expect(await w.svc.tick(new Date("2026-10-11T04:05:00Z"))).toBe(false);
    expect(await w.svc.tick(mon)).toBe(true);
    expect(await w.svc.tick(new Date(mon.getTime() + 5 * 60_000))).toBe(false);
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]!.to).toBe("919999900000");
    expect(w.sent[0]!.text).toContain("बॉट पर लिखने वाले नंबर: 42");
    expect(w.sent[0]!.text).toContain("रेटिंग: 4.5 ⭐ (2 ग्राहक)");
    expect(w.sent[0]!.text).toContain("मुस्कान मिश्रा: 2 (1 देर से)");
    expect(w.sent[0]!.text).toContain("बिना नाम: 1");
    // Owners are not counted as customers.
    expect(w.prisma.waContact.count.mock.calls[0][0].where.phone).toEqual({ notIn: ["919999900000"] });
    expect(logged).toContain("weekly report sent");
  });

  it("'हफ़्ते की रिपोर्ट' from the owner gets it now, and is never a task", async () => {
    const w = world();
    const tasksSvc: any = { create: vi.fn() };
    const owner = new OwnerAssistantService({ waContact: { findUnique: async () => null } } as any, tasksSvc, {} as any, { extract: vi.fn() } as any, w.outbox, undefined, undefined, undefined, w.svc);
    const r = await owner.handle("919999900000", { type: "text", text: "हफ़्ते की रिपोर्ट" });
    expect(r[0]).toContain("📊 पिछले 7 दिन की रिपोर्ट");
    expect(tasksSvc.create).not.toHaveBeenCalled();
  });
});
