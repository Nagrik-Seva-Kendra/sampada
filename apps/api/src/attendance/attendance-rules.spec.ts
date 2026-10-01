import { DEFAULT_ATTENDANCE_SETTINGS, PunchInput } from "@sampada/shared";
import { describe, expect, it } from "vitest";
import { closedDay, dayStatus, haversineM, monthDays, parseLeaveDecision, parseLeaveText, punchDecision, salaryLine } from "./attendance-rules.js";

const OFFICE = { lat: 26.2124, lng: 78.1772 }; // Gwalior (test values)
const S = { ...DEFAULT_ATTENDANCE_SETTINGS, officeLat: OFFICE.lat, officeLng: OFFICE.lng };
const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

describe("geofence", () => {
  it("distance and radius (default 100 m)", () => {
    expect(haversineM(OFFICE.lat, OFFICE.lng, OFFICE.lat, OFFICE.lng)).toBe(0);
    expect(haversineM(OFFICE.lat, OFFICE.lng, OFFICE.lat + 0.0005, OFFICE.lng)).toBe(56);
    const near = punchDecision({ kind: "IN", now: ist("2026-10-01", "09:58"), lat: OFFICE.lat + 0.0005, lng: OFFICE.lng, settings: S, today: [] });
    expect(near).toMatchObject({ ok: true, code: "haazir", inside: true, distanceM: 56 });
    const far = punchDecision({ kind: "IN", now: ist("2026-10-01", "09:58"), lat: OFFICE.lat + 0.01, lng: OFFICE.lng, settings: S, today: [] });
    expect(far).toMatchObject({ ok: false, code: "tooFar", inside: false });
    expect(far.distanceM).toBeGreaterThan(1000);
  });

  it("no GPS → no attendance (lat/lng required); office not set → noOffice", () => {
    expect(PunchInput.safeParse({ kind: "IN" }).success).toBe(false);
    expect(PunchInput.safeParse({ kind: "IN", lat: 26.2, lng: 78.1 }).success).toBe(true);
    expect(punchDecision({ kind: "IN", now: new Date(), lat: 1, lng: 1, settings: DEFAULT_ATTENDANCE_SETTINGS, today: [] }).code).toBe("noOffice");
  });
});

describe("IN / OUT rules, late, half day", () => {
  const at = (h: string) => ist("2026-10-01", h);
  const p = (kind: "IN" | "OUT", h: string) => ({ kind, at: at(h) });
  const go = (kind: "IN" | "OUT" | "FIELD", h: string, today: { kind: "IN" | "OUT" | "FIELD"; at: Date }[] = [], reason?: string) =>
    punchDecision({ kind, now: at(h), lat: OFFICE.lat, lng: OFFICE.lng, settings: S, today, reason });
  it("late after 15 min, half day after 2 h", () => {
    expect(go("IN", "10:15")).toMatchObject({ code: "haazir", lateMin: 15 });
    expect(go("IN", "10:16")).toMatchObject({ code: "late", lateMin: 16 });
    expect(go("IN", "12:01")).toMatchObject({ code: "halfDay", lateMin: 121 });
  });
  it("one IN and one OUT a day; OUT not within 1 hour; OUT needs IN; field needs a reason", () => {
    expect(go("IN", "11:00", [p("IN", "10:00")]).code).toBe("already");
    expect(go("OUT", "10:30", [p("IN", "10:00")]).code).toBe("tooSoon");
    expect(go("OUT", "11:00", [p("IN", "10:00")])).toMatchObject({ ok: true, code: "out" });
    expect(go("OUT", "19:00", [p("IN", "10:00"), p("OUT", "18:00")]).code).toBe("already");
    expect(go("OUT", "19:00").code).toBe("noIn");
    expect(go("FIELD", "12:00").code).toBe("needReason");
    expect(go("FIELD", "12:00", [], "तहसील में नकल लेने")).toMatchObject({ ok: true, code: "field" });
  });
  it("day status: closed days, leave, late, field, absent", () => {
    const base = { today: "2026-10-31", leaves: [], settings: S, holidays: ["2026-10-20"] };
    expect(closedDay("2026-10-04", S, [])).toBe("off"); // Sunday
    expect(dayStatus({ ...base, day: "2026-10-20", punches: [] }).status).toBe("holiday");
    expect(dayStatus({ ...base, day: "2026-10-05", punches: [{ kind: "IN", at: ist("2026-10-05", "10:20") }] })).toEqual({ status: "late", lateMin: 20 });
    expect(dayStatus({ ...base, day: "2026-10-05", punches: [{ kind: "FIELD", at: ist("2026-10-05", "11:00") }] }).status).toBe("field");
    expect(dayStatus({ ...base, day: "2026-10-05", punches: [], leaves: [{ fromDate: "2026-10-05", toDate: "2026-10-06", halfDay: false }] }).status).toBe("leave");
    expect(dayStatus({ ...base, day: "2026-10-06", punches: [] }).status).toBe("absent");
    expect(dayStatus({ ...base, today: "2026-10-01", day: "2026-10-06", punches: [] }).status).toBe("future");
  });
});

describe("salary", () => {
  it("working days, per day, paid-leave quota, unpaid leave + absence, half day, start date, adjustments", () => {
    const days = monthDays("2026-10").map((day) => {
      const off = closedDay(day, S, ["2026-10-20"]);
      return { day, status: (off ?? "present") as any };
    });
    // Oct 2026: 31 days, 4 Sundays + 1 holiday → 26 working days
    const set = (day: string, status: string) => (days.find((d) => d.day === day)!.status = status as any);
    set("2026-10-05", "leave");
    set("2026-10-06", "leave");
    set("2026-10-07", "absent");
    set("2026-10-08", "halfDay");
    set("2026-10-09", "late");
    const line = salaryLine({ monthly: 13000, days, startDate: null, paidLeavePerMonth: 1, lateDeductionDay: 0, bonus: 500, advance: 1000 });
    expect(line).toMatchObject({ totalDays: 31, offDays: 5, workingDays: 26, perDay: 500, paidLeave: 1, unpaidLeave: 1, absent: 1, halfDays: 1, lateCount: 1 });
    expect(line.unpaidDays).toBe(2.5); // 1 unpaid leave + 1 absent + 0.5 half day
    expect(line.deduction).toBe(1250);
    expect(line.payable).toBe(13000 - 1250 + 500 - 1000);
    expect(salaryLine({ monthly: 13000, days, startDate: null, paidLeavePerMonth: 1, lateDeductionDay: 0.5 }).unpaidDays).toBe(3); // optional late deduction
    expect(salaryLine({ monthly: 13000, days, startDate: "2026-10-12", paidLeavePerMonth: 1, lateDeductionDay: 0 }).unpaidDays).toBe(9); // 1–11 Oct minus 2 Sundays = 9 working days before the start
  });
});

describe("leave on WhatsApp", () => {
  it("dates, half day, type, reason; owner's decision", () => {
    expect(parseLeaveText("छुट्टी 12/10 से 13/10 बीमारी: बुखार है", "2026-10-01")).toEqual({
      fromDate: "2026-10-12", toDate: "2026-10-13", halfDay: false, type: "SICK", reason: "बुखार है",
    });
    expect(parseLeaveText("kal chhutti chahiye aadha din: bank jana hai", "2026-10-01")).toMatchObject({ fromDate: "2026-10-02", toDate: "2026-10-02", halfDay: true, type: "OTHER", reason: "bank jana hai" });
    expect(parseLeaveText("kal aaunga", "2026-10-01")).toBeNull();
    expect(parseLeaveDecision("मंज़ूर 5")).toEqual({ approve: true, n: 5 });
    expect(parseLeaveDecision("नामंज़ूर 5")).toEqual({ approve: false, n: 5 });
    expect(parseLeaveDecision("reject 12")).toEqual({ approve: false, n: 12 });
    expect(parseLeaveDecision("5 हो गया")).toBeNull();
  });
});
