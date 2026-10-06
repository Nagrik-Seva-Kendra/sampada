import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS, DEFAULT_FOLLOW_UP_RULES } from "@sampada/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effectiveKind,
  followUpDue,
  followUpText,
  inOfficeHours,
  nextOpening,
  officeCallNumber,
  STOP_RE,
  WANT_RE,
  whenHi,
} from "./call-rules.js";
import { CallbackService } from "./callback.service.js";
import { FrontDoorService } from "./front-door.service.js";
import { FollowUpService, followUpDueNow } from "./followup.service.js";
import { menuText, parseMenuChoice } from "./wa-smart.js";

const ORG = "org-1";
const PHONE = "919876543210";
const H = DEFAULT_ATTENDANCE_SETTINGS; // 10:00–19:00, Sunday off
const ist = (s: string) => new Date(`${s}+05:30`);

/** In-memory Prisma: equality, gte/lte/in/not, compound unique keys. */
function fakePrisma() {
  const t: Record<string, any[]> = {};
  let seq = 0;
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k.includes("_") && v && typeof v === "object" && !(v instanceof Date)) return match(row, v);
      const x = row[k];
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v && !v.in.includes(x)) return false;
        if ("gte" in v && !(x >= v.gte)) return false;
        if ("lte" in v && !(x <= v.lte)) return false;
        if ("not" in v && x === v.not) return false;
        return true;
      }
      return x === v;
    });
  const sort = (rows: any[], orderBy: any) => {
    if (!orderBy) return rows;
    const [k, dir] = Object.entries(orderBy)[0] as [string, string];
    return [...rows].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === "desc" ? -1 : 1));
  };
  const model = (name: string, defaults: () => any = () => ({})) => {
    const rows = (t[name] ??= []);
    return {
      findMany: async (a: any = {}) => sort(rows.filter((r) => match(r, a.where)), a.orderBy).slice(0, a.take ?? 1e9),
      findFirst: async (a: any = {}) => sort(rows.filter((r) => match(r, a.where)), a.orderBy)[0] ?? null,
      findUnique: async (a: any) => rows.find((r) => match(r, a.where)) ?? null,
      count: async (a: any = {}) => rows.filter((r) => match(r, a.where)).length,
      create: async (a: any) => {
        const row = { id: `${name}-${++seq}`, createdAt: new Date(), ...defaults(), ...a.data };
        rows.push(row);
        return row;
      },
      update: async (a: any) => Object.assign(rows.find((r) => match(r, a.where)), a.data),
      updateMany: async (a: any) => {
        const hit = rows.filter((r) => match(r, a.where));
        hit.forEach((r) => Object.assign(r, a.data));
        return { count: hit.length };
      },
      upsert: async (a: any) => {
        const row = rows.find((r) => match(r, a.where));
        if (row) return Object.assign(row, a.update);
        const created = { id: `${name}-${++seq}`, ...defaults(), ...a.create };
        rows.push(created);
        return created;
      },
    };
  };
  return {
    t,
    callbackRequest: model("callbackRequest", () => ({ status: "NEW", doneAt: null, doneById: null, doneNote: null })),
    followUp: model("followUp", () => ({ status: "PENDING", recurring: false, sentAt: null, repliedAt: null })),
    followUpRule: model("followUpRule"),
    draftIntake: model("draftIntake"),
    waContact: model("waContact"),
    user: model("user"),
    membership: model("membership"),
  } as any;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("call rules", () => {
  it("OFFICE_CALL_NUMBER: empty hides the option", () => {
    expect(officeCallNumber("")).toBeNull();
    expect(officeCallNumber("78984 75648")).toBe("917898475648");
    expect(officeCallNumber("+91-7898475648")).toBe("917898475648");
    expect(menuText(false)).not.toContain("5.");
    expect(menuText(true)).toContain("5. ऑफिस को कॉल / कॉल बैक");
    expect(parseMenuChoice("5", false)).toBeNull();
    expect(parseMenuChoice("5", true)).toBe(5);
    expect(parseMenuChoice("call karna hai", true)).toBe(5);
    expect(parseMenuChoice("call karna hai", false)).toBe(4);
  });

  it("office hours, holidays and the next opening", () => {
    expect(inOfficeHours(ist("2026-10-05T11:00:00"), H, [])).toBe(true); // Monday
    expect(inOfficeHours(ist("2026-10-05T19:30:00"), H, [])).toBe(false);
    expect(inOfficeHours(ist("2026-10-04T11:00:00"), H, [])).toBe(false); // Sunday
    expect(nextOpening(ist("2026-10-03T20:00:00"), H, [])).toEqual(ist("2026-10-05T10:00:00")); // Sat night → Mon
    expect(nextOpening(ist("2026-10-05T08:00:00"), H, [])).toEqual(ist("2026-10-05T10:00:00"));
    expect(nextOpening(ist("2026-10-05T20:00:00"), H, ["2026-10-06"])).toEqual(ist("2026-10-07T10:00:00"));
    expect(whenHi(ist("2026-10-05T10:00:00"), ist("2026-10-04T12:00:00"))).toBe("कल 10:00 बजे");
  });

  it("follow-up day per kind", () => {
    const on = { enabled: true, offsetDays: 30 };
    const today = "2026-10-03";
    expect(followUpDue("sale", on, { today, registryDay: "2026-10-01", termEnd: null })).toEqual({ dueDate: "2026-10-31", recurring: false });
    expect(followUpDue("agreement", { enabled: true, offsetDays: 15 }, { today, registryDay: today, termEnd: "2027-09-30" })).toEqual({ dueDate: "2027-09-15", recurring: false });
    expect(followUpDue("agreement", on, { today, registryDay: today, termEnd: null })).toBeNull();
    expect(followUpDue("patta", on, { today, registryDay: today, termEnd: "2026-10-20" })).toEqual({ dueDate: "2026-10-04", recurring: false }); // late → tomorrow
    expect(followUpDue("patta", on, { today, registryDay: today, termEnd: "2026-09-01" })).toBeNull(); // over
    expect(followUpDue("mortgage", on, { today, registryDay: "2026-10-01", termEnd: null })).toEqual({ dueDate: "2027-10-01", recurring: true });
    expect(followUpDue("mortgage", on, { today, registryDay: today, termEnd: "2031-10-01" })).toEqual({ dueDate: "2031-09-01", recurring: false });
    expect(followUpDue("sale", { enabled: false, offsetDays: 30 }, { today, registryDay: today, termEnd: null })).toBeNull();
    expect(effectiveKind("sale", "auto")).toBe("sale");
    expect(effectiveKind("mortgage", null)).toBe("mortgage");
    expect(effectiveKind("other", "auto")).toBeNull();
    expect(effectiveKind("other", "patta")).toBe("patta");
    expect(effectiveKind("sale", "none")).toBeNull();
  });

  it("text, STOP and 'हाँ करवाना है'", () => {
    const rule = DEFAULT_FOLLOW_UP_RULES.find((r) => r.kind === "patta")!;
    expect(followUpText(rule, { name: "रमेश", ref: "AB12CD", date: "2026-11-15" })).toContain("रमेश, नागरिक सेवा केंद्र से: आपके पट्टे (अनुरोध AB12CD) की अवधि 15/11/2026");
    for (const s of ["बंद", "BAND", "stop", "Stop!", "band karo"]) expect(STOP_RE.test(s)).toBe(true);
    expect(STOP_RE.test("बंद लिफ़ाफ़ा")).toBe(false);
    for (const s of ["हाँ करवाना है", "haan karwana hai", "karwana hai", "हाँ"]) expect(WANT_RE.test(s)).toBe(true);
    expect(WANT_RE.test("नहीं")).toBe(false);
  });
});

describe("menu 5: call and call-back", () => {
  function world() {
    vi.stubEnv("OFFICE_CALL_NUMBER", "7898475648");
    vi.stubEnv("WA_ACCESS_TOKEN", "");
    const prisma = fakePrisma();
    const outbox = { alertOwners: vi.fn(async () => 1), post: vi.fn(async () => ({ ok: false })) };
    const callbacks = { create: vi.fn(async () => ({ number: 7 })) };
    const followups = { reply: vi.fn(async (): Promise<string[] | null> => null) };
    const attendance = { settings: async () => H, holidays: async () => [] };
    const front = new FrontDoorService(prisma, outbox as any, {} as any, {} as any, callbacks as any, followups as any, attendance as any);
    return { front, callbacks, followups, say: (t: string, now: Date) => front.handle(PHONE, t, async () => null, now) };
  }

  it("5 → number + choice; 1 → call now (office open)", async () => {
    const w = world();
    const now = ist("2026-10-05T11:00:00");
    const r = await w.say("5", now);
    expect(r.replies[0]).toContain("+91 78984 75648");
    expect(r.replies[0]).toContain("2. ऑफिस मुझे कॉल करे");
    expect((await w.say("1", now)).replies[0]).toBe("📞 कृपया +91 78984 75648 पर कॉल करें।");
  });

  it("call-back: when → what → saved; a time outside office hours moves to the next opening", async () => {
    const w = world();
    const now = ist("2026-10-05T11:00:00"); // Monday
    await w.say("5", now);
    expect((await w.say("2", now)).replies[0]).toContain("आपको कब कॉल करें");
    expect((await w.say("आज 9 बजे रात", now)).replies[0]).toContain("किस काम के लिए");
    const done = await w.say("रजिस्ट्री की तारीख", now);
    expect(done.replies[0]).toContain("कॉल बैक दर्ज हो गया (नंबर 7)");
    expect(done.replies[0]).toContain("ऑफिस के समय (10:00–19:00) से बाहर");
    expect(done.replies[0]).toContain("कल 10:00 बजे");
    expect(w.callbacks.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: PHONE, purpose: "रजिस्ट्री की तारीख", preferredAt: ist("2026-10-06T10:00:00"), source: "whatsapp" }),
    );
  });

  it("'अभी' on a Sunday: call comes when the office opens", async () => {
    const w = world();
    const now = ist("2026-10-04T12:00:00");
    await w.say("5", now);
    await w.say("2", now);
    await w.say("अभी", now);
    const r = await w.say("बंधक", now);
    expect(r.replies[0]).toContain("ऑफिस अभी बंद है");
    expect(r.replies[0]).toContain("कल 10:00 बजे के बाद");
  });

  it("buttons do the same; no number configured → no option 5", async () => {
    const w = world();
    expect(await w.front.callButton(PHONE, "call:back", ist("2026-10-05T11:00:00"))).toEqual([expect.stringContaining("आपको कब कॉल करें")]);
    vi.stubEnv("OFFICE_CALL_NUMBER", "");
    expect(await w.front.callButton(PHONE, "call:now")).toBeNull();
    expect((await w.say("5", ist("2026-10-05T11:00:00"))).replies[0]).not.toContain("78984");
  });
});

describe("call-backs on the web", () => {
  function svc(role: string, userId = "u-owner") {
    vi.stubEnv("WA_DEFAULT_ORG_ID", ORG);
    vi.stubEnv("WA_OWNER_NUMBERS", "919000000001");
    const prisma = fakePrisma();
    const cls: any = { get: () => ({ userId, organizationId: ORG, membershipId: "m", role }) };
    const outbox = { deliverDirect: vi.fn(async () => ({ status: "SENT" })) };
    return { prisma, outbox, s: new CallbackService(prisma, cls, outbox as any) };
  }

  it("bot call-back → assigned to the request's staff, owner + assignee alerted; staff see only theirs", async () => {
    const a = svc("OWNER");
    await a.prisma.user.create({ data: { id: "u-emp", fname: "Rahul", lname: "B", mobile: "8319127664" } });
    await a.prisma.draftIntake.create({ data: { id: "req-1xyz123", organizationId: ORG, phone: PHONE, status: "SUBMITTED", assigneeId: "u-emp", customerName: "राम", createdAt: new Date() } });
    const cb = await a.s.create({ phone: PHONE, preferredAt: null, preferredText: null, purpose: "बंधक", source: "whatsapp" });
    expect(cb.number).toBe(1);
    expect(a.outbox.deliverDirect.mock.calls.map((c: any) => c[0]).sort()).toEqual(["918319127664", "919000000001"]);
    await a.s.create({ phone: "919111111111", preferredAt: null, preferredText: null, purpose: "x", source: "whatsapp" });
    const owner = await a.s.list();
    expect(owner.data.map((c) => c.number)).toEqual([1, 2]);
    expect(owner.data[0]).toMatchObject({ assigneeName: "Rahul B", requestRef: "XYZ123", customerName: "राम" });

    const emp = new CallbackService(a.prisma, { get: () => ({ userId: "u-emp", organizationId: ORG, membershipId: "m", role: "EMPLOYEE" }) } as any, a.outbox as any);
    expect((await emp.list()).data.map((c) => c.number)).toEqual([1]);
    const other = owner.data.find((c) => c.number === 2)!;
    await expect(emp.done(other.id, null)).rejects.toBeInstanceOf(NotFoundException);
    await expect(emp.assign(other.id, "u-emp")).rejects.toBeInstanceOf(ForbiddenException);
    const done = await emp.done(owner.data[0]!.id, "बात हो गई");
    expect(done).toMatchObject({ status: "DONE", doneNote: "बात हो गई", doneByName: "Rahul B" });
    expect((await emp.list()).newCount).toBe(0);
  });
});

describe("follow-ups", () => {
  function world() {
    vi.stubEnv("WA_DEFAULT_ORG_ID", ORG);
    const prisma = fakePrisma();
    const cls: any = { get: () => ({ userId: "u-owner", organizationId: ORG, membershipId: "m", role: "OWNER" }) };
    const outbox = { send: vi.fn(async () => ({})) };
    const callbacks = { create: vi.fn(async () => ({ number: 3 })) };
    const f = new FollowUpService(prisma, cls, outbox as any, callbacks as any);
    const req = { id: "req-1xyz123", organizationId: ORG, phone: PHONE, workStatus: "DONE", data: { deedType: "sale" }, registryDate: "2026-10-01", customerName: "राम", closedAt: new Date() };
    return { prisma, outbox, callbacks, f, req };
  }

  it("DONE sale → mutation question 30 days after the registry; sent once by the job (template outside the window)", async () => {
    const w = world();
    await w.prisma.draftIntake.create({ data: w.req });
    await w.f.scheduleFor(w.req, ist("2026-10-03T12:00:00"));
    expect(w.prisma.t.followUp).toMatchObject([{ kind: "sale", dueDate: "2026-10-31", status: "PENDING" }]);
    expect(followUpDueNow(ist("2026-10-31T09:00:00"))).toBe(false);
    expect(await w.f.send(ist("2026-10-30T12:00:00"))).toBe(0);
    expect(await w.f.send(ist("2026-10-31T11:30:00"))).toBe(1);
    expect(await w.f.send(ist("2026-10-31T12:30:00"))).toBe(0);
    const m = (w.outbox.send.mock.calls[0] as any)[0];
    expect(m).toMatchObject({ kind: "FOLLOWUP", to: PHONE, template: { name: "follow_up_reminder_v2" } });
    // Name, request number, deed kind, date -- the fixed template text carries the rest.
    expect(m.template.params.slice(1)).toEqual([expect.stringMatching(/^[A-Z0-9]{6}$/), "विक्रय पत्र", "01/10/2026"]);
    expect(m.text).toContain("नामांतरण (mutation)");
    expect(m.text).toContain('"बंद" लिखें');
    expect(m.template.params[0]).not.toContain("\n");
  });

  it("owner-edited rule (off) → nothing planned; reopening cancels", async () => {
    const w = world();
    await w.f.saveRules([{ ...DEFAULT_FOLLOW_UP_RULES[3]!, enabled: false }]);
    await w.f.scheduleFor(w.req, ist("2026-10-03T12:00:00"));
    expect(w.prisma.t.followUp ?? []).toHaveLength(0);
    await w.f.saveRules([{ ...DEFAULT_FOLLOW_UP_RULES[3]!, enabled: true, offsetDays: 10 }]);
    await w.f.scheduleFor(w.req, ist("2026-10-03T12:00:00"));
    expect(w.prisma.t.followUp[0]).toMatchObject({ dueDate: "2026-10-11" });
    await w.f.scheduleFor({ ...w.req, workStatus: "IN_PROGRESS" });
    expect(w.prisma.t.followUp[0].status).toBe("CANCELLED");
  });

  it("mortgage without a loan period is asked every year", async () => {
    const w = world();
    const req = { ...w.req, data: { deedType: "mortgage" } };
    await w.prisma.draftIntake.create({ data: req });
    await w.f.scheduleFor(req, ist("2026-10-03T12:00:00"));
    expect(w.prisma.t.followUp[0]).toMatchObject({ kind: "mortgage", dueDate: "2027-10-01", recurring: true });
    await w.f.send(ist("2027-10-01T11:30:00"));
    expect(w.prisma.t.followUp.map((x: any) => [x.dueDate, x.status])).toEqual([
      ["2027-10-01", "SENT"],
      ["2028-09-30", "PENDING"],
    ]);
  });

  it("'बंद' opts out of all follow-ups; 'हाँ करवाना है' → call-back + reply", async () => {
    const w = world();
    await w.prisma.draftIntake.create({ data: w.req });
    await w.f.scheduleFor(w.req, ist("2026-10-03T12:00:00"));
    expect(await w.f.reply(PHONE, "नमस्ते")).toBeNull();
    expect(await w.f.reply(PHONE, "हाँ करवाना है")).toBeNull(); // nothing sent yet
    await w.f.send(ist("2026-10-31T11:30:00"));
    const yes = await w.f.reply(PHONE, "हाँ करवाना है", ist("2026-11-01T10:00:00"));
    expect(yes![0]).toContain("नामांतरण (mutation) के लिए हमारा स्टाफ जल्द आपको कॉल करेगा");
    expect(w.callbacks.create).toHaveBeenCalledWith(expect.objectContaining({ phone: PHONE, source: "followup", purpose: expect.stringContaining("XYZ123") }));
    expect(w.prisma.t.followUp[0].status).toBe("YES");

    // A new one planned, then "बंद": opted out, nothing more planned.
    await w.f.scheduleFor({ ...w.req, registryDate: "2026-10-20" }, ist("2026-10-21T12:00:00"));
    expect((await w.f.reply(PHONE, "बंद"))![0]).toContain("नहीं भेजे जाएँगे");
    expect(w.prisma.t.followUp.at(-1).status).toBe("OPTED_OUT");
    expect(await w.f.optedOut(PHONE)).toBe(true);
    await w.f.scheduleFor({ ...w.req, registryDate: "2026-10-20" }, ist("2026-10-21T12:00:00"));
    expect(w.prisma.t.followUp.filter((x: any) => x.status === "PENDING")).toHaveLength(0);
  });

  it("only OWNER/ADMIN edit the rules", async () => {
    const prisma = fakePrisma();
    const f = new FollowUpService(prisma, { get: () => ({ userId: "u", organizationId: ORG, membershipId: "m", role: "EMPLOYEE" }) } as any, {} as any, {} as any);
    await expect(f.saveRules(DEFAULT_FOLLOW_UP_RULES)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
