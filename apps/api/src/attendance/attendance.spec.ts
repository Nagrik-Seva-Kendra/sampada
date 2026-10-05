import { ForbiddenException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffModeService } from "../whatsapp/staff-mode.service.js";
import { AttendanceJobsService, matchStaffNames } from "./attendance-jobs.service.js";
import { AttendanceService } from "./attendance.service.js";
import { SalaryService } from "./salary.service.js";

/** Minimal in-memory Prisma for the attendance tables (equality, gte/lte/not/endsWith, compound unique keys). */
function fakePrisma() {
  const tables: Record<string, any[]> = {};
  let seq = 0;
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k.includes("_") && v && typeof v === "object" && !(v instanceof Date)) return match(row, v); // organizationId_month
      const x = row[k];
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("gte" in v && !(x >= v.gte)) return false;
        if ("lte" in v && !(x <= v.lte)) return false;
        if ("not" in v && x === v.not) return false;
        if ("endsWith" in v && !String(x ?? "").endsWith(v.endsWith)) return false;
        return true;
      }
      return x === v;
    });
  const sortBy = (rows: any[], orderBy: any) => {
    if (!orderBy) return rows;
    const [k, dir] = Object.entries(orderBy)[0] as [string, string];
    return [...rows].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === "desc" ? -1 : 1));
  };
  const model = (name: string, defaults: () => any = () => ({})) => {
    const t = (tables[name] ??= []);
    return {
      findMany: async (a: any = {}) => sortBy(t.filter((r) => match(r, a.where)), a.orderBy).slice(0, a.take ?? 1e9),
      findFirst: async (a: any = {}) => sortBy(t.filter((r) => match(r, a.where)), a.orderBy)[0] ?? null,
      findUnique: async (a: any) => t.find((r) => match(r, a.where)) ?? null,
      create: async (a: any) => {
        const row = { id: `${name}-${++seq}`, createdAt: new Date(), ...defaults(), ...a.data };
        t.push(row);
        return row;
      },
      update: async (a: any) => {
        const row = t.find((r) => match(r, a.where));
        Object.assign(row, a.data);
        return row;
      },
      updateMany: async (a: any) => {
        const rows = t.filter((r) => match(r, a.where));
        rows.forEach((r) => Object.assign(r, a.data));
        return { count: rows.length };
      },
      upsert: async (a: any) => {
        const row = t.find((r) => match(r, a.where));
        if (row) return Object.assign(row, a.update);
        const created = { id: `${name}-${++seq}`, createdAt: new Date(), ...defaults(), ...a.create };
        t.push(created);
        return created;
      },
    };
  };
  const prisma: any = {
    tables,
    attendanceConfig: model("attendanceConfig"),
    holiday: model("holiday"),
    attendanceRecord: model("attendanceRecord"),
    leaveRequest: model("leaveRequest", () => ({ status: "PENDING", decidedAt: null })),
    salaryRate: model("salaryRate"),
    salarySheet: model("salarySheet", () => ({ status: "DRAFT", adjustments: {}, sentTo: [] })),
    waContact: model("waContact"),
    membership: model("membership"),
    user: model("user"),
    task: model("task"),
    waJobRun: model("waJobRun"),
  };
  return prisma;
}

const ORG = "org-1";
const OFFICE = { lat: 26.2183, lng: 78.1828 };
const OWNER_PHONE = "919000000001";
const RAHUL_PHONE = "918319127664";

async function world(role = "OWNER") {
  const prisma = fakePrisma();
  for (const [id, fname, lname, mobile, r] of [
    ["owner", "Anuj", "Sharma", "9000000001", "OWNER"],
    ["rahul", "Rahul", "Baghel", "8319127664", "EMPLOYEE"],
    ["amit", "Amit", "Mathur", "8770167486", "ADMIN"],
  ] as const) {
    await prisma.user.create({ data: { id, fname, lname, mobile } });
    await prisma.membership.create({ data: { organizationId: ORG, status: "ACTIVE", role: r, user: { id, fname, lname, mobile } } });
  }
  await prisma.attendanceConfig.create({ data: { organizationId: ORG, config: { officeLat: OFFICE.lat, officeLng: OFFICE.lng } } });
  const ctx = { role, userId: role === "OWNER" ? "owner" : role === "ADMIN" ? "amit" : "rahul" };
  const cls: any = { get: () => ({ userId: ctx.userId, organizationId: ORG, membershipId: "m", role: ctx.role }) };
  const sent: { to: string; text: string; template: any }[] = [];
  const outbox: any = {
    deliverDirect: vi.fn(async (to: string, text: string, template: any) => {
      sent.push({ to, text, template });
      return { status: "SENT", via: "text", reason: null };
    }),
    inWindow: async () => false,
    post: async () => ({ ok: false, wamid: null, code: null }),
  };
  const attendance = new AttendanceService(prisma, cls, outbox);
  const salary = new SalaryService(prisma, cls, attendance, outbox);
  return { prisma, cls, ctx, sent, outbox, attendance, salary };
}

afterEach(() => vi.unstubAllEnvs());

describe("salary access (server-side, OWNER only)", () => {
  it.each(["ADMIN", "EMPLOYEE"])("%s gets 403 on every salary call", async (role) => {
    const w = await world(role);
    const calls = [
      () => w.salary.history("rahul"),
      () => w.salary.setRate({ userId: "rahul", monthly: 12000, effectiveFrom: "2026-09-01" }),
      () => w.salary.sheet("2026-09"),
      () => w.salary.adjust("2026-09", { userId: "rahul", bonus: 0, advance: 0, otherDeduction: 0, note: null }),
      () => w.salary.finalize("2026-09"),
      () => w.salary.send("2026-09", "rahul"),
      () => w.salary.exportXlsx("2026-09"),
    ];
    for (const c of calls) await expect(c()).rejects.toBeInstanceOf(ForbiddenException);
    expect(w.prisma.tables.salaryRate ?? []).toHaveLength(0);
  });

  it("OWNER sets a rate, gets a sheet, finalizes and sends the slip; nothing logs the amount", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c: any) => (logs.push(String(c)), true));
    const w = await world("OWNER");
    await w.salary.setRate({ userId: "rahul", monthly: 15500, effectiveFrom: "2026-09-01" });
    const sheet = await w.salary.sheet("2026-09");
    expect(sheet.lines.map((l) => l.userId)).toEqual(["rahul"]); // amit has no salary yet
    expect(sheet.lines[0]!.workingDays).toBe(26); // 30 days − 4 Sundays
    await expect(w.salary.send("2026-09", "rahul")).rejects.toThrow(/फ़ाइनल/);
    await w.salary.finalize("2026-09");
    const r = await w.salary.send("2026-09", "rahul");
    expect(r.sent).toBe(true);
    expect(w.sent.at(-1)!.to).toBe(RAHUL_PHONE);
    expect(w.sent.at(-1)!.text).toContain("वेतन पर्ची");
    spy.mockRestore();
    expect(logs.join("\n")).toContain("salary sheet 2026-09 finalized");
    expect(logs.join("\n")).not.toMatch(/15[,.]?500/);
  });
});

describe("attendance punch", () => {
  const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00+05:30`); // Thursday

  it("records IN inside the radius, refuses outside it, and requires 1 hour before OUT", async () => {
    const w = await world();
    // Computer without GPS: a 150 km guess is not saved, and the reply says why (in km, no distance).
    const rough = await w.attendance.punch(ORG, "rahul", { kind: "IN", lat: OFFICE.lat, lng: OFFICE.lng, accuracyM: 150_432.7 }, "web", at("10:04"));
    expect(rough).toEqual({ ok: false, code: "lowAccuracy", accuracyM: 150_433 });
    expect(w.prisma.tables.attendanceRecord ?? []).toHaveLength(0);
    const far = await w.attendance.punch(ORG, "rahul", { kind: "IN", lat: OFFICE.lat + 0.01, lng: OFFICE.lng }, "web", at("10:05"));
    expect(far).toMatchObject({ ok: false, code: "tooFar" });
    const ok = await w.attendance.punch(ORG, "rahul", { kind: "IN", lat: OFFICE.lat, lng: OFFICE.lng }, "web", at("10:07"));
    expect(ok).toMatchObject({ ok: true, code: "haazir" });
    expect((await w.attendance.punch(ORG, "rahul", { kind: "IN", lat: OFFICE.lat, lng: OFFICE.lng }, "web", at("10:30"))).code).toBe("already");
    expect((await w.attendance.punch(ORG, "rahul", { kind: "OUT", lat: OFFICE.lat, lng: OFFICE.lng }, "web", at("10:50"))).code).toBe("tooSoon");
    expect((await w.attendance.punch(ORG, "rahul", { kind: "OUT", lat: OFFICE.lat, lng: OFFICE.lng }, "web", at("19:00"))).code).toBe("out");
    expect(w.prisma.tables.attendanceRecord).toHaveLength(2);
  });
});

describe("leave approval", () => {
  it("staff applies, owner is alerted, decision reaches the staff member", async () => {
    vi.stubEnv("WA_OWNER_NUMBERS", OWNER_PHONE);
    const w = await world();
    const item = await w.attendance.apply(ORG, "rahul", { fromDate: "2026-10-12", toDate: "2026-10-13", halfDay: false, type: "SICK", reason: "बुखार" }, "web");
    expect(item.number).toBe(1);
    expect(w.sent.at(-1)!.to).toBe(OWNER_PHONE);
    expect(w.sent.at(-1)!.template.name).toBe("leave_request");
    const reply = await w.attendance.decideByNumber(ORG, 1, true, "owner");
    expect(reply).toContain("✅ मंज़ूर");
    expect(w.sent.at(-1)!.to).toBe(RAHUL_PHONE);
    expect(w.sent.at(-1)!.text).toContain("मंज़ूर हो गई");
    expect(w.prisma.tables.leaveRequest[0].status).toBe("APPROVED");
  });

  it("only OWNER/ADMIN decide from the web", async () => {
    const w = await world("EMPLOYEE");
    const item = await w.attendance.apply(ORG, "rahul", { fromDate: "2026-10-12", toDate: "2026-10-12", halfDay: true, type: "OTHER", reason: "काम" }, "web");
    await expect(w.attendance.decideWeb(item.id, true)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("WhatsApp staff mode", () => {
  async function staffWorld() {
    vi.stubEnv("WA_DEFAULT_ORG_ID", ORG);
    vi.stubEnv("WA_OWNER_NUMBERS", OWNER_PHONE);
    vi.stubEnv("WA_ACCESS_TOKEN", "");
    const w = await world();
    const owner: any = {
      staffForPhone: async (p: string) => (await w.attendance.staff(ORG)).find((s) => s.phone === p) ?? null,
      handleStaff: async () => null,
    };
    const mode = new StaffModeService(w.prisma, w.attendance, owner, w.outbox);
    return { ...w, mode };
  }
  const now = new Date("2026-10-01T10:07:00+05:30");

  it("ignores customers", async () => {
    const w = await staffWorld();
    expect(await w.mode.handle("919999999999", { type: "text", text: "नमस्ते" }, now)).toBeNull();
  });

  it("हाज़िरी → location → हाज़िर 10:07", async () => {
    const w = await staffWorld();
    expect((await w.mode.handle(RAHUL_PHONE, { type: "text", text: "हाज़िरी" }, now))![0]).toContain("लोकेशन भेजें");
    const r = await w.mode.handle(RAHUL_PHONE, { type: "location", location: { latitude: OFFICE.lat, longitude: OFFICE.lng } }, now);
    expect(r).toEqual(["✅ हाज़िर 10:07"]);
  });

  it("a location without asking first records nothing", async () => {
    const w = await staffWorld();
    const r = await w.mode.handle(RAHUL_PHONE, { type: "location", location: { latitude: OFFICE.lat, longitude: OFFICE.lng } }, now);
    expect(r![0]).toContain("पहले लिखें");
    expect(w.prisma.tables.attendanceRecord ?? []).toHaveLength(0);
  });

  it("too far → asks a reason → separate FIELD record", async () => {
    const w = await staffWorld();
    await w.mode.handle(RAHUL_PHONE, { type: "text", text: "हाज़िरी" }, now);
    const far = await w.mode.handle(RAHUL_PHONE, { type: "location", location: { latitude: OFFICE.lat + 0.02, longitude: OFFICE.lng } }, now);
    expect(far![0]).toContain("बाहर का काम है तो कारण लिखें");
    const r = await w.mode.handle(RAHUL_PHONE, { type: "text", text: "तहसील में नामांतरण" }, now);
    expect(r![0]).toContain("बाहर का काम दर्ज");
    expect(w.prisma.tables.attendanceRecord).toMatchObject([{ kind: "FIELD", reason: "तहसील में नामांतरण", inside: false }]);
  });

  it("leave by text, owner approves with a button", async () => {
    const w = await staffWorld();
    const r = await w.mode.handle(RAHUL_PHONE, { type: "text", text: "छुट्टी 12/10 से 13/10 बीमारी: बुखार" }, now);
    expect(r![0]).toContain("अर्ज़ी #1");
    const id = w.prisma.tables.leaveRequest[0].id;
    expect(await w.mode.ownerText(OWNER_PHONE, "नमस्ते")).toBeNull();
    const d = await w.mode.ownerButton(OWNER_PHONE, `leave:reject:${id}`);
    expect(d![0]).toContain("नामंज़ूर");
    expect(w.prisma.tables.leaveRequest[0]).toMatchObject({ status: "REJECTED", decidedById: "owner" });
    expect((await w.mode.ownerText(OWNER_PHONE, "मंज़ूर 1"))![0]).toContain("✅ मंज़ूर");
  });

  it("other message types get the staff help, never the customer flow", async () => {
    const w = await staffWorld();
    const r = await w.mode.handle(RAHUL_PHONE, { type: "image" }, now);
    expect(r![0]).toContain("स्टाफ के लिए");
  });
});

describe("matchStaffNames", () => {
  it("matches full names case-insensitively and reports the rest", () => {
    const r = matchStaffNames([
      { userId: "a", name: "rahul  baghel" },
      { userId: "b", name: "Amit Mathur" },
      { userId: "c", name: "Rohit Sharma" },
      { userId: "d", name: "Rohit Sharma" },
    ]);
    expect(r.matched).toEqual([
      { userId: "a", name: "Rahul Baghel", mobile: "8319127664" },
      { userId: "b", name: "Amit Mathur", mobile: "8770167486" },
    ]);
    expect(r.missing).toEqual(["Muskan Mishra", "Anmol Kandoi", "Rohit Sharma"]);
  });
});

describe("owner reports", () => {
  it("morning report once, only within 2 hours of start + 30 min; template outside the window", async () => {
    vi.stubEnv("WA_DEFAULT_ORG_ID", ORG);
    vi.stubEnv("WA_OWNER_NUMBERS", OWNER_PHONE);
    const w = await world();
    const jobs = new AttendanceJobsService(w.prisma, w.attendance, w.salary, w.outbox);
    await jobs.reports(new Date("2026-10-01T10:20:00+05:30"));
    expect(w.sent).toHaveLength(0);
    await jobs.reports(new Date("2026-10-01T10:31:00+05:30"));
    await jobs.reports(new Date("2026-10-01T10:45:00+05:30"));
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]!.to).toBe(OWNER_PHONE);
    expect(w.sent[0]!.template.name).toBe("staff_notice");
    expect(w.sent[0]!.template.params[1]).not.toContain("\n");
    // A restart late in the day does not send a stale morning report.
    const w2 = await world();
    const jobs2 = new AttendanceJobsService(w2.prisma, w2.attendance, w2.salary, w2.outbox);
    await jobs2.reports(new Date("2026-10-01T15:00:00+05:30"));
    expect(w2.sent).toHaveLength(0);
  });
});
