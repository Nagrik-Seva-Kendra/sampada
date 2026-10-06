/**
 * Staff attendance reminders. Everything is mocked: no real WhatsApp message
 * is sent (fetch is stubbed where the real outbox is used).
 */
import { Logger } from "@nestjs/common";
import { DEFAULT_ATTENDANCE_SETTINGS, templateProblems, WA_TEMPLATES } from "@sampada/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WaOutboxService } from "../whatsapp/wa-outbox.service.js";
import { AttendanceJobsService } from "./attendance-jobs.service.js";
import { reminderSummary, reminderTargets, reminderText } from "./attendance-reminders.js";

const DAY = "2026-10-06"; // Tuesday; office 10:00-19:00 → reminders at 10:30 (IN) and 20:00 (OUT) IST
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+05:30`);
const STAFF = [
  { userId: "u1", name: "Anmol Kandoi", firstName: "Anmol", phone: "919000000001" },
  { userId: "u2", name: "Rohit Senwar", firstName: "Rohit", phone: "919000000002" },
  { userId: "u3", name: "Pooja", firstName: "Pooja", phone: "919000000003" },
  { userId: "u4", name: "Ravi", firstName: "Ravi", phone: null },
  { userId: "u5", name: "Sunita", firstName: "Sunita", phone: "919000000005" },
];
const IN = "2026-10-06T04:35:00Z";
const OUT = "2026-10-06T13:40:00Z";

beforeEach(() => {
  vi.stubEnv("WA_DEFAULT_ORG_ID", "org-1");
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("who gets a reminder", () => {
  const day = (status: string, inAt: string | null = null, outAt: string | null = null) => ({ status: status as any, inAt, outAt });

  it("IN: not punched in; leave / half day / off / holiday / field / no mobile / switched off are not sent", () => {
    const days: Record<string, any> = { u1: day("absent"), u2: day("present", IN), u3: day("leave"), u4: day("absent"), u5: day("absent") };
    const r = reminderTargets(STAFF, (id) => days[id], "IN", { reminderSkipUserIds: ["u5"] });
    expect(r.send.map((s) => s.userId)).toEqual(["u1"]);
    expect(r.skipped).toEqual([
      { name: "Ravi", reason: "मोबाइल नहीं" },
      { name: "Sunita", reason: "reminder बंद" },
    ]);
    for (const st of ["leave", "halfLeave", "halfDay", "off", "holiday", "field"]) {
      expect(reminderTargets(STAFF.slice(0, 1), () => day(st), "IN", { reminderSkipUserIds: [] }).send).toEqual([]);
    }
  });

  it("OUT: punched in, not out; never-came staff get no OUT reminder", () => {
    const days: Record<string, any> = { u1: day("present", IN), u2: day("late", IN, OUT), u3: day("absent"), u4: day("present", IN), u5: day("halfDay", IN) };
    const r = reminderTargets(STAFF, (id) => days[id], "OUT", { reminderSkipUserIds: [] });
    expect(r.send.map((s) => s.userId)).toEqual(["u1"]);
    expect(r.skipped).toEqual([{ name: "Ravi", reason: "मोबाइल नहीं" }]);
  });

  it("text, summary, template draft passes the app's template checks", () => {
    expect(reminderText("Anmol", "OUT")).toBe('नमस्ते Anmol, आपने आज OUT अटेंडेंस नहीं लगाई है। कृपया "OUT" लिखकर भेज दें।');
    expect(reminderSummary("OUT", ["Anmol Kandoi"], [{ name: "Ravi", reason: "मोबाइल नहीं" }])).toBe("📨 OUT reminder: 1 स्टाफ को भेजा; 1 को नहीं — Ravi (मोबाइल नहीं)");
    expect(reminderSummary("IN", [], [])).toBeNull();
    expect(WA_TEMPLATES.attendanceReminder).toMatchObject({ name: "attendance_reminder_v1", language: "hi", category: "UTILITY" });
    expect(templateProblems(WA_TEMPLATES.attendanceReminder)).toEqual([]);
  });
});

/** The jobs service with mocked attendance data and outbox. */
function jobs(opts: { days: Record<string, any>; settings?: any; holidays?: string[]; sendResult?: (to: string) => { status: string; reason: string | null } }) {
  const runs = new Set<string>();
  const prisma: any = {
    waJobRun: {
      findUnique: vi.fn(async ({ where }: any) => (runs.has(where.name) ? { name: where.name } : null)),
      create: vi.fn(async ({ data }: any) => runs.add(data.name)),
    },
  };
  const settings = { ...DEFAULT_ATTENDANCE_SETTINGS, ...(opts.settings ?? {}) };
  const attendance: any = {
    settings: vi.fn(async () => settings),
    holidays: vi.fn(async () => (opts.holidays ?? []).map((date) => ({ date }))),
    staff: vi.fn(async () => STAFF),
    grid: vi.fn(async () => STAFF.map((s) => ({ userId: s.userId, name: s.name, days: [opts.days[s.userId] ?? { status: "absent", inAt: null, outAt: null }] }))),
    morningReport: vi.fn(async () => "🕘 आज की हाज़िरी"),
    eveningReport: vi.fn(async () => "🌆 आज OUT नहीं किया (1): Anmol Kandoi"),
    ownerNumbers: () => ["919111111111"],
  };
  const outbox: any = {
    send: vi.fn(async (m: any) => ({ id: "n", kind: m.kind, ...(opts.sendResult?.(m.to) ?? { status: "SENT", reason: null }) })),
    deliverDirect: vi.fn(async () => ({ status: "SENT", via: "text", reason: null })),
  };
  const svc = new AttendanceJobsService(prisma, attendance, {} as any, outbox);
  return { svc, outbox, runs, attendance };
}

describe("reminder job (existing report times, once per staff/kind/day)", () => {
  const days = { u1: { status: "present", inAt: IN, outAt: null }, u2: { status: "present", inAt: IN, outAt: OUT }, u3: { status: "leave", inAt: null, outAt: null } };

  it("8:00 PM: OUT reminder to who has not punched out, recorded as ATTENDANCE; owner's alert shows the count", async () => {
    const w = jobs({ days });
    await w.svc.reports(at("20:00"));
    const toStaff = w.outbox.send.mock.calls.map((c: any[]) => c[0]);
    expect(toStaff).toHaveLength(1);
    expect(toStaff[0]).toMatchObject({
      to: "919000000001",
      kind: "ATTENDANCE",
      draftIntakeId: "att-remind:OUT:2026-10-06:u1",
      text: 'नमस्ते Anmol, आपने आज OUT अटेंडेंस नहीं लगाई है। कृपया "OUT" लिखकर भेज दें।',
      template: { name: "attendance_reminder_v1", language: "hi", params: ["Anmol", "OUT"] },
    });
    const owner = w.outbox.deliverDirect.mock.calls[0]!;
    expect(owner[0]).toBe("919111111111");
    expect(owner[1]).toContain("🌆 आज OUT नहीं किया (1): Anmol Kandoi");
    expect(owner[1]).toContain("📨 OUT reminder: 1 स्टाफ को भेजा");
  });

  it("not before the time, not twice in a day, not after OUT is marked", async () => {
    const w = jobs({ days });
    await w.svc.reports(at("19:59"));
    expect(w.outbox.send).not.toHaveBeenCalled();
    await w.svc.reports(at("20:00"));
    await w.svc.reports(at("20:05"));
    expect(w.outbox.send).toHaveBeenCalledTimes(1);
    // Even if the owner report key were cleared, the per-staff key stops a second reminder.
    w.runs.delete("att-evening:2026-10-06");
    await w.svc.reports(at("20:10"));
    expect(w.outbox.send).toHaveBeenCalledTimes(1);
    const done = jobs({ days: { ...days, u1: { status: "present", inAt: IN, outAt: OUT } } });
    await done.svc.reports(at("20:00"));
    expect(done.outbox.send).not.toHaveBeenCalled();
  });

  it("10:30 AM: IN reminder; holiday / weekly off → nothing; switch off → nothing to staff", async () => {
    const w = jobs({ days: { u1: { status: "absent", inAt: null, outAt: null }, u2: { status: "present", inAt: IN, outAt: null }, u3: { status: "leave", inAt: null, outAt: null }, u5: { status: "present", inAt: IN, outAt: null } } });
    await w.svc.reports(at("10:30"));
    expect(w.outbox.send.mock.calls.map((c: any[]) => c[0].to)).toEqual(["919000000001"]);
    expect(w.outbox.deliverDirect.mock.calls[0]![1]).toContain("📨 IN reminder: 1 स्टाफ को भेजा; 1 को नहीं — Ravi (मोबाइल नहीं)");

    const hol = jobs({ days: {}, holidays: [DAY] });
    await hol.svc.reports(at("10:30"));
    expect(hol.outbox.send).not.toHaveBeenCalled();
    const sunday = jobs({ days: {} });
    await sunday.svc.reports(new Date("2026-10-11T10:30:00+05:30"));
    expect(sunday.outbox.send).not.toHaveBeenCalled();

    const off = jobs({ days: { u1: { status: "absent", inAt: null, outAt: null } }, settings: { staffReminders: false } });
    await off.svc.reports(at("10:30"));
    expect(off.outbox.send).not.toHaveBeenCalled();
    expect(off.outbox.deliverDirect).toHaveBeenCalledTimes(1); // the owner's report still goes
  });

  it("not sent (template not approved / no payment method) → recorded with the reason and shown to the owner", async () => {
    const w = jobs({ days, sendResult: () => ({ status: "PENDING", reason: "WhatsApp टेम्पलेट स्वीकृत नहीं / मौजूद नहीं" }) });
    await w.svc.reports(at("20:00"));
    expect(w.outbox.deliverDirect.mock.calls[0]![1]).toContain("📨 OUT reminder: 0 स्टाफ को भेजा; 1 को नहीं — Anmol Kandoi (WhatsApp टेम्पलेट स्वीकृत नहीं / मौजूद नहीं)");
  });
});

describe("24h window: text inside it, the template outside it (real outbox, fetch stubbed)", () => {
  function outbox(lastInboundAt: Date | null, graph: (body: any) => [number, any]) {
    vi.stubEnv("WA_ACCESS_TOKEN", "t");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "1");
    const bodies: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: any) => {
        const b = JSON.parse(init.body);
        bodies.push(b);
        const [status, json] = graph(b);
        return new Response(JSON.stringify(json), { status });
      }),
    );
    const rows: any[] = [];
    const prisma: any = {
      waContact: { findUnique: vi.fn(async () => (lastInboundAt ? { lastInboundAt } : null)) },
      waNotification: { create: vi.fn(async ({ data }: any) => (rows.push({ id: "n1", createdAt: new Date(), ...data }), rows.at(-1))) },
    };
    return { out: new WaOutboxService(prisma), bodies, rows };
  }
  const msg = { organizationId: "org-1", draftIntakeId: "att-remind:OUT:2026-10-06:u1", kind: "ATTENDANCE" as const, to: "919000000001", text: "x", template: { name: "attendance_reminder_v1", language: "hi", params: ["Anmol", "OUT"] } };

  it("wrote in the last 24h → plain text", async () => {
    const o = outbox(new Date(Date.now() - 3600_000), () => [200, { messages: [{ id: "w" }] }]);
    expect(await o.out.send(msg)).toMatchObject({ status: "SENT", via: "text" });
    expect(o.bodies[0].type).toBe("text");
  });

  it("no message in 24h → attendance_reminder_v1; not approved / no payment method → PENDING with the reason, stored", async () => {
    let o = outbox(new Date(Date.now() - 30 * 3600_000), () => [200, { messages: [{ id: "w" }] }]);
    expect(await o.out.send(msg)).toMatchObject({ status: "SENT", via: "template" });
    expect(o.bodies[0]).toMatchObject({ type: "template", template: { name: "attendance_reminder_v1" } });
    o = outbox(null, () => [400, { error: { code: 132001 } }]);
    expect(await o.out.send(msg)).toMatchObject({ status: "PENDING", reason: "WhatsApp टेम्पलेट स्वीकृत नहीं / मौजूद नहीं" });
    expect(o.rows[0]).toMatchObject({ kind: "ATTENDANCE", status: "PENDING" });
    o = outbox(null, () => [400, { error: { code: 131042 } }]);
    expect((await o.out.send(msg)).reason).toContain("payment method");
  });
});
