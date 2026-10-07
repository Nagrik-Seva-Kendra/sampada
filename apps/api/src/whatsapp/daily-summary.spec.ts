import { Logger } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS, templateProblems, WA_TEMPLATES } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attendanceLine, isSummaryAsk, summaryDue, summaryParams, summaryText } from "./daily-summary.js";
import { DailySummaryService } from "./daily-summary.service.js";
import { OwnerAssistantService } from "./owner-assistant.service.js";
import { WaOutboxService } from "./wa-outbox.service.js";

const OWNER = "919999900000";
const OWNER2 = "919999911111";
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org1");
  vi.stubEnv("WA_OWNER_NUMBERS", `${OWNER},${OWNER2}`);
  vi.stubEnv("WA_ACCESS_TOKEN", "t");
  vi.stubEnv("WA_PHONE_NUMBER_ID", "111");
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(((m: unknown) => {
      logged.push(String(m));
    }) as never);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const AT_2030 = new Date("2026-10-08T15:00:00Z"); // 20:30 IST
const STATS = { created: 4, closed: 2, pending: 7, attendance: { off: false, noIn: ["राहुल", "सीमा"], noOut: ["मुस्कान"] } };

describe("the evening summary text", () => {
  it.each(["सारांश", "आज का सारांश", "summary", "Saransh", "हिसाब", "aaj ka hisab"])("%s asks it", (t) => expect(isSummaryAsk(t)).toBe(true));
  it.each(["सारांश भेजो राहुल को", "कल 10 बजे तहसील", "रिपोर्ट"])("%s does not", (t) => expect(isSummaryAsk(t)).toBe(false));

  it("from 20:30 IST until midnight, once a day", () => {
    expect(summaryDue(new Date("2026-10-08T14:59:00Z"), null)).toBe(false);
    expect(summaryDue(AT_2030, null)).toBe(true);
    expect(summaryDue(new Date("2026-10-08T16:00:00Z"), AT_2030)).toBe(false);
    expect(summaryDue(new Date("2026-10-09T15:00:00Z"), AT_2030)).toBe(true);
  });

  it("short, Hindi, counts and names only", () => {
    const t = summaryText(STATS, AT_2030);
    expect(t).toBe(
      "🌙 आज का सारांश (08/10/2026)\n📥 नए अनुरोध: 4 · ✅ पूरे: 2 · ⏳ बाकी: 7\n🕘 हाज़िरी: IN नहीं लगाई राहुल, सीमा; OUT नहीं लगाई मुस्कान\nकभी भी \"सारांश\" लिखकर देखें।",
    );
    expect(attendanceLine({ off: true, noIn: [], noOut: [] })).toBe("आज छुट्टी");
    expect(attendanceLine({ off: false, noIn: [], noOut: [] })).toBe("सबकी पूरी");
    expect(attendanceLine(null)).toBe("जानकारी नहीं मिली");
  });

  it("the template passes the template rules and is in the app's 'Meta को भेजें' list", () => {
    const tpl = WA_TEMPLATES.ownerDailySummary;
    expect(tpl).toMatchObject({ name: "owner_daily_summary_v1", language: "hi", category: "UTILITY" });
    expect(templateProblems(tpl)).toEqual([]);
    expect(summaryParams(STATS, AT_2030)).toEqual(["08/10/2026", "4", "2", "7", "IN नहीं लगाई राहुल, सीमा; OUT नहीं लगाई मुस्कान"]);
  });
});

function world(opts: { ownerInWindow?: string[]; settings?: any } = {}) {
  const runs = new Map<string, Date>();
  const counts: any[] = [];
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
    draftIntake: {
      count: async (a: any) => {
        counts.push(a.where);
        return a.where.createdAt ? 4 : a.where.closedAt ? 2 : 7;
      },
    },
    waContact: {
      findUnique: async ({ where }: any) =>
        (opts.ownerInWindow ?? []).includes(where.phone) ? { phone: where.phone, lastInboundAt: new Date(AT_2030.getTime() - 3600_000) } : null,
    },
  };
  const posts: { to: string; type: string; body: any }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: any) => {
      const b = JSON.parse(init.body);
      posts.push({ to: b.to, type: b.type, body: b.type === "text" ? b.text.body : b.template });
      return new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 });
    }),
  );
  const attendance: any = {
    settings: async () => opts.settings ?? DEFAULT_ATTENDANCE_SETTINGS,
    todayMissing: vi.fn(async () => STATS.attendance),
  };
  const svc = new DailySummaryService(prisma, new WaOutboxService(prisma), attendance);
  return { svc, posts, runs, counts, attendance };
}

describe("the 8:30 PM job", () => {
  it("in the window → free text; outside → owner_daily_summary_v1 template; once a day, restart-safe", async () => {
    const w = world({ ownerInWindow: [OWNER] });
    expect(await w.svc.tick(new Date("2026-10-08T14:00:00Z"))).toBe(false);
    expect(await w.svc.tick(AT_2030)).toBe(true);
    const toOwner = w.posts.find((p) => p.to === OWNER)!;
    expect(toOwner.type).toBe("text");
    expect(toOwner.body).toContain("नए अनुरोध: 4");
    const toOwner2 = w.posts.find((p) => p.to === OWNER2)!;
    expect(toOwner2.type).toBe("template");
    expect(toOwner2.body.name).toBe("owner_daily_summary_v1");
    expect(toOwner2.body.components[0].parameters.map((x: any) => x.text)).toEqual(summaryParams(STATS, AT_2030));
    // Same evening again, or a restarted / second instance: nothing more.
    expect(await w.svc.tick(new Date(AT_2030.getTime() + 10 * 60_000))).toBe(false);
    const restarted = new DailySummaryService((w.svc as any).prisma, new WaOutboxService((w.svc as any).prisma), w.attendance);
    expect(await restarted.tick(new Date(AT_2030.getTime() + 20 * 60_000))).toBe(false);
    expect(w.posts).toHaveLength(2);
    // Requests: today's new (not cancelled), finished today, all still open.
    expect(w.counts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ createdAt: expect.any(Object), status: { not: "CANCELLED" } }),
        expect.objectContaining({ workStatus: { in: ["DONE", "REJECTED"] } }),
        expect.objectContaining({ status: "SUBMITTED" }),
      ]),
    );
    expect(w.attendance.todayMissing).toHaveBeenCalledWith("org1", AT_2030);
    // Logs: counts only.
    const all = logged.join("\n");
    expect(all).toContain("daily summary: sent to 2 of 2");
    expect(all).not.toMatch(/9999900000|9999911111|राहुल|मुस्कान/);
  });

  it("off by WA_DAILY_SUMMARY=off or the app setting; not claimed then", async () => {
    vi.stubEnv("WA_DAILY_SUMMARY", "off");
    const a = world();
    expect(await a.svc.tick(AT_2030)).toBe(false);
    expect(a.posts).toHaveLength(0);
    vi.stubEnv("WA_DAILY_SUMMARY", "");
    const b = world({ settings: { ...DEFAULT_ATTENDANCE_SETTINGS, ownerDailySummary: false } });
    expect(await b.svc.tick(AT_2030)).toBe(false);
    expect(b.posts).toHaveLength(0);
    expect(b.runs.size).toBe(0);
  });

  it("'सारांश' from the owner: the same summary now, never a task", async () => {
    const w = world();
    const tasks: any = { create: vi.fn() };
    const owner = new OwnerAssistantService({ waContact: { findUnique: async () => null } } as any, tasks, {} as any, { extract: vi.fn() } as any, {} as any, undefined, undefined, undefined, undefined, w.svc);
    const r = await owner.handle(OWNER, { type: "text", text: "सारांश" }, AT_2030);
    expect(r[0]).toContain("🌙 आज का सारांश (08/10/2026)");
    expect(tasks.create).not.toHaveBeenCalled();
  });
});
