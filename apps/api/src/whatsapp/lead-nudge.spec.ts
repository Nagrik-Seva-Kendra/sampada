import { Logger } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrontDoorService } from "./front-door.service.js";
import { leadKindOf, nudgeHours, nudgeText } from "./lead-nudge.js";
import { LeadNudgeService } from "./lead-nudge.service.js";

const PHONE = "919000003333";
let logged: string[] = [];
beforeEach(() => {
  logged = [];
  vi.stubEnv("WA_ACCESS_TOKEN", "t");
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

describe("which conversations are leads", () => {
  it.each([
    ["draft-howto", "draft"],
    ["draft-question", "draft"],
    ["cost", "cost"],
    ["faq-other-doc", "other-doc"],
    ["faq-seller-died", "question"],
    ["greeting", null],
    ["faq-witness", null],
    ["thanks", null],
  ])("%s → %s", (route, kind) => {
    expect(leadKindOf(route)).toBe(kind);
  });

  it("office-friendly hours only (IST)", () => {
    expect(nudgeHours(new Date("2026-10-07T05:00:00Z"))).toBe(true); // 10:30
    expect(nudgeHours(new Date("2026-10-07T15:30:00Z"))).toBe(false); // 21:00
    expect(nudgeHours(new Date("2026-10-07T02:00:00Z"))).toBe(false); // 07:30
  });

  it("the reminder says how to start and how to stop", () => {
    const t = nudgeText("cost");
    expect(t).toContain("रजिस्ट्री के खर्च");
    expect(t).toContain("PDF");
    expect(t).toContain("4 लिखें");
    expect(t).toContain('"बंद"');
  });
});

function contactsDb() {
  const contacts = new Map<string, any>();
  const waContact = {
    findUnique: async ({ where }: any) => contacts.get(where.phone) ?? null,
    upsert: async ({ where, create, update }: any) => {
      const c = contacts.get(where.phone);
      contacts.set(where.phone, c ? { ...c, ...update } : { gibberishStreak: 0, ...create });
    },
    update: async ({ where, data }: any) => contacts.set(where.phone, { ...(contacts.get(where.phone) ?? {}), ...data }),
    updateMany: async ({ where, data }: any) => {
      const c = contacts.get(where.phone);
      if (!c) return { count: 0 };
      if ("leadNudgedAt" in where && (c.leadNudgedAt ?? null) !== (where.leadNudgedAt ?? null)) return { count: 0 };
      if (where.leadAt?.not === null && c.leadAt == null) return { count: 0 };
      contacts.set(where.phone, { ...c, ...data });
      return { count: 1 };
    },
    // The job's query, done in memory.
    findMany: async ({ where }: any) =>
      [...contacts.values()].filter(
        (c) =>
          c.leadAt &&
          c.leadAt <= where.leadAt.lte &&
          c.lastInboundAt > where.lastInboundAt.gt &&
          c.lastInboundAt <= where.lastInboundAt.lte &&
          !c.blockedAt &&
          !c.followUpOptOutAt &&
          (!c.leadNudgedAt || c.leadNudgedAt < where.OR[1].leadNudgedAt.lt) &&
          !(where.phone?.notIn ?? []).includes(c.phone),
      ),
  };
  return { contacts, waContact };
}

function world() {
  const db = contactsDb();
  const intakes: { phone: string; createdAt: Date }[] = [];
  const prisma: any = new Proxy(
    { waContact: db.waContact, waOfficeFeeConfig: { findUnique: async () => null }, draftIntake: { count: async ({ where }: any) => intakes.filter((i) => i.phone === where.phone && i.createdAt >= where.createdAt.gte).length } } as any,
    { get: (t, k) => t[k] ?? { findMany: async () => [], findFirst: async () => null, count: async () => 0 } },
  );
  const sent: { to: string; body: string }[] = [];
  const outbox: any = {
    alertOwners: vi.fn(async () => 1),
    post: vi.fn(async (to: string, m: any) => {
      sent.push({ to, body: m.text.body });
      return { ok: true, wamid: "w", code: null };
    }),
  };
  const front = new FrontDoorService(
    prisma,
    outbox,
    { extract: async () => null } as any,
    { lookup: async () => null } as any,
    {} as any,
    { reply: async () => null } as any,
    { settings: async () => DEFAULT_ATTENDANCE_SETTINGS, holidays: async () => [] } as any,
  );
  const job = new LeadNudgeService(prisma, outbox);
  // A message: the webhook first opens the 24h window, then the front door answers.
  const say = async (t: string, at: Date, phone = PHONE) => {
    await db.waContact.upsert({ where: { phone }, create: { phone, lastInboundAt: at }, update: { lastInboundAt: at } });
    return front.handle(phone, t, async () => null, at);
  };
  return { ...db, intakes, sent, say, job };
}

const T0 = new Date("2026-10-07T12:00:00Z"); // 17:30 IST; +21 h = 14:30 IST
const H = 3600_000;

describe("the next-day reminder", () => {
  it("asked the cost, sent nothing → one reminder 20-23 h later, then never again that week", async () => {
    const w = world();
    await w.say("registry ka kharcha kitna hai", T0);
    expect(w.contacts.get(PHONE)).toMatchObject({ leadKind: "cost", leadAt: T0 });
    expect(await w.job.run(new Date(T0.getTime() + 19 * H))).toBe(0);
    expect(await w.job.run(new Date(T0.getTime() + 21 * H))).toBe(1);
    expect(w.sent).toEqual([{ to: PHONE, body: expect.stringContaining("रजिस्ट्री के खर्च") }]);
    expect(await w.job.run(new Date(T0.getTime() + 22 * H))).toBe(0);
    // Asks again two days later: no second reminder within 7 days.
    const t2 = new Date(T0.getTime() + 48 * H);
    await w.say("registry ka kharcha kitna hai", t2);
    expect(await w.job.run(new Date(t2.getTime() + 21 * H))).toBe(0);
    expect(w.sent).toHaveLength(1);
    expect(logged.join("\n")).not.toContain("3333");
  });

  it("no reminder once papers came, after 'बंद', after 'स्टाफ से बात', after 23 h, or to the owner", async () => {
    const papers = world();
    await papers.say("1", T0);
    papers.intakes.push({ phone: PHONE, createdAt: new Date(T0.getTime() + H) });
    expect(await papers.job.run(new Date(T0.getTime() + 21 * H))).toBe(0);

    const closed = world();
    await closed.say("2", T0);
    await closed.say("बंद", new Date(T0.getTime() + 60_000));
    expect(await closed.job.run(new Date(T0.getTime() + 21 * H))).toBe(0);

    const staff = world();
    await staff.say("2", T0);
    await staff.say("4", new Date(T0.getTime() + 60_000));
    expect(await staff.job.run(new Date(T0.getTime() + 21 * H))).toBe(0);

    const late = world();
    await late.say("2", T0);
    expect(await late.job.run(new Date(T0.getTime() + 23.5 * H))).toBe(0);

    const owner = world();
    await owner.say("2", T0, "919999900000");
    expect(await owner.job.run(new Date(T0.getTime() + 21 * H))).toBe(0);

    for (const w of [papers, closed, staff, late, owner]) expect(w.sent).toHaveLength(0);
  });

  it("just 'hi' or a witness question is not a lead", async () => {
    const w = world();
    await w.say("hi", T0);
    await w.say("gawah kitne chahiye", T0);
    expect(w.contacts.get(PHONE).leadAt).toBeUndefined();
  });
});
