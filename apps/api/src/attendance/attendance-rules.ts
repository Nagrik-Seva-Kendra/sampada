/**
 * Pure attendance / leave / salary rules (attendance-rules.spec.ts). All days
 * are IST "YYYY-MM-DD". No Nest/Prisma.
 */
import type { AttendanceSettings, DayStatus, LeaveType } from "@sampada/shared";

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export const istDay = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
export const istMinutes = (d: Date): number => {
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
};
export const hhmmToMin = (s: string): number => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
/** Weekday (0 = Sunday) of an IST day string. */
export const weekday = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();
export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** "off" (weekly off), "holiday" (owner's list) or null for a working day. Government holidays are never added on their own. */
export function closedDay(day: string, s: Pick<AttendanceSettings, "weeklyOff">, holidays: string[]): "off" | "holiday" | null {
  if (holidays.includes(day)) return "holiday";
  return s.weeklyOff.includes(weekday(day)) ? "off" : null;
}

export interface Punch {
  kind: "IN" | "OUT" | "FIELD";
  at: Date;
}

export type PunchCode =
  | "haazir"
  | "late"
  | "halfDay"
  | "out"
  | "field"
  | "tooFar"
  | "already"
  | "tooSoon"
  | "noIn"
  | "noOffice"
  | "needReason"
  | "lowAccuracy"
  | "noGps";

/**
 * A reading rougher than this cannot tell "in the office" from "not": computers
 * without GPS guess from the internet connection (often 100+ km off).
 */
export const MAX_PUNCH_ACCURACY_M = 1000;

/**
 * Whether a button press may be recorded. IN / OUT count as in the office
 * when the press comes from the office internet (`officeNet`), else the GPS
 * reading must be inside the office radius ("tooFar" → the app offers
 * "बाहर का काम" with a reason), not rougher than MAX_PUNCH_ACCURACY_M
 * ("lowAccuracy"), and present ("noGps"). One IN and one OUT a day, OUT at
 * least 1 hour after IN; FIELD needs a reason and a location.
 */
export function punchDecision(input: {
  kind: "IN" | "OUT" | "FIELD";
  now: Date;
  lat?: number | null;
  lng?: number | null;
  reason?: string;
  accuracyM?: number | null;
  officeNet?: boolean;
  settings: AttendanceSettings;
  today: Punch[];
}): { ok: boolean; code: PunchCode; inside: boolean; distanceM: number | null; lateMin: number } {
  const s = input.settings;
  const hasPos = input.lat != null && input.lng != null;
  const rough = input.accuracyM != null && input.accuracyM > MAX_PUNCH_ACCURACY_M;
  const distanceM = hasPos && !rough && s.officeLat != null && s.officeLng != null ? haversineM(s.officeLat, s.officeLng, input.lat!, input.lng!) : null;
  const inside = !!input.officeNet || (distanceM != null && distanceM <= s.radiusM);
  const base = { inside, distanceM, lateMin: 0 };
  if (input.kind === "FIELD") {
    if (!input.reason?.trim()) return { ...base, ok: false, code: "needReason" };
    if (!hasPos) return { ...base, ok: false, code: "noGps" };
    return { ...base, ok: true, code: "field" };
  }
  const hasIn = input.today.find((p) => p.kind === "IN");
  const where = (): PunchCode | null => {
    if (input.officeNet) return null;
    if (s.officeLat == null || s.officeLng == null) return "noOffice";
    if (!hasPos) return "noGps";
    if (rough) return "lowAccuracy";
    return inside ? null : "tooFar";
  };
  if (input.kind === "IN") {
    if (hasIn) return { ...base, ok: false, code: "already" };
    const bad = where();
    if (bad) return { ...base, ok: false, code: bad };
    const lateMin = Math.max(0, istMinutes(input.now) - hhmmToMin(s.startTime));
    const code: PunchCode = lateMin > s.halfDayAfterMin ? "halfDay" : lateMin > s.lateAfterMin ? "late" : "haazir";
    return { ...base, ok: true, code, lateMin };
  }
  if (!hasIn) return { ...base, ok: false, code: "noIn" };
  if (input.today.some((p) => p.kind === "OUT")) return { ...base, ok: false, code: "already" };
  if (input.now.getTime() - hasIn.at.getTime() < 3600_000) return { ...base, ok: false, code: "tooSoon" };
  // OUT is recorded wherever it is pressed (as before), but needs a usable reading or the office internet.
  if (!input.officeNet) {
    if (s.officeLat == null || s.officeLng == null) return { ...base, ok: false, code: "noOffice" };
    if (!hasPos) return { ...base, ok: false, code: "noGps" };
    if (rough) return { ...base, ok: false, code: "lowAccuracy" };
  }
  return { ...base, ok: true, code: "out" };
}

export interface LeaveSpan {
  fromDate: string;
  toDate: string;
  halfDay: boolean;
}

/** A staff member's status for one day. */
export function dayStatus(input: {
  day: string;
  today: string;
  punches: Punch[];
  leaves: LeaveSpan[];
  settings: AttendanceSettings;
  holidays: string[];
}): { status: DayStatus; lateMin: number } {
  const closed = closedDay(input.day, input.settings, input.holidays);
  if (closed) return { status: closed, lateMin: 0 };
  if (input.day > input.today) return { status: "future", lateMin: 0 };
  const leave = input.leaves.find((l) => l.fromDate <= input.day && input.day <= l.toDate);
  const inP = input.punches.find((p) => p.kind === "IN");
  if (leave && !leave.halfDay) return { status: "leave", lateMin: 0 };
  if (leave?.halfDay) return { status: "halfLeave", lateMin: 0 };
  if (inP) {
    const lateMin = Math.max(0, istMinutes(inP.at) - hhmmToMin(input.settings.startTime));
    if (lateMin > input.settings.halfDayAfterMin) return { status: "halfDay", lateMin };
    if (lateMin > input.settings.lateAfterMin) return { status: "late", lateMin };
    return { status: "present", lateMin };
  }
  if (input.punches.some((p) => p.kind === "FIELD")) return { status: "field", lateMin: 0 };
  return { status: "absent", lateMin: 0 };
}

export interface SalaryInput {
  monthly: number;
  /** Status of every day of the month, in order. */
  days: { day: string; status: DayStatus }[];
  /** First working day of employment (salary start); earlier days are unpaid. */
  startDate: string | null;
  paidLeavePerMonth: number;
  lateDeductionDay: number;
  bonus?: number;
  advance?: number;
  otherDeduction?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Month salary: working days = days − weekly offs − holidays; per day =
 * salary / working days. Leave within the monthly quota is paid; leave above
 * it and absence without leave are deducted; a half day counts 0.5; late
 * arrivals deduct lateDeductionDay each (0 = off). Days before the start date
 * are unpaid. Rupees rounded to whole numbers.
 */
export function salaryLine(i: SalaryInput) {
  const totalDays = i.days.length;
  const offDays = i.days.filter((d) => d.status === "off" || d.status === "holiday").length;
  const workingDays = totalDays - offDays;
  const perDay = workingDays > 0 ? i.monthly / workingDays : 0;
  let present = 0;
  let halfDays = 0;
  let lateCount = 0;
  let leaveUnits = 0;
  let absent = 0;
  let preJoin = 0;
  for (const d of i.days) {
    if (d.status === "off" || d.status === "holiday") continue;
    if (i.startDate && d.day < i.startDate) {
      preJoin++;
      continue;
    }
    switch (d.status) {
      case "present":
      case "field":
      case "future":
        present++;
        break;
      case "late":
        present++;
        lateCount++;
        break;
      case "halfDay":
        present += 0.5;
        halfDays++;
        break;
      case "leave":
        leaveUnits += 1;
        break;
      case "halfLeave":
        leaveUnits += 0.5;
        present += 0.5;
        break;
      case "absent":
        absent++;
        break;
    }
  }
  const paidLeave = Math.min(leaveUnits, i.paidLeavePerMonth);
  const unpaidLeave = r2(leaveUnits - paidLeave);
  const unpaidDays = r2(unpaidLeave + absent + halfDays * 0.5 + lateCount * i.lateDeductionDay + preJoin);
  const deduction = Math.round(unpaidDays * perDay);
  const bonus = i.bonus ?? 0;
  const advance = i.advance ?? 0;
  const otherDeduction = i.otherDeduction ?? 0;
  return {
    monthly: i.monthly,
    totalDays,
    offDays,
    workingDays,
    perDay: r2(perDay),
    present: r2(present),
    halfDays,
    lateCount,
    paidLeave: r2(paidLeave),
    unpaidLeave,
    absent,
    unpaidDays,
    deduction,
    bonus,
    advance,
    otherDeduction,
    payable: Math.max(0, Math.round(i.monthly - deduction + bonus - advance - otherDeduction)),
  };
}

// ---------- WhatsApp: leave application from staff ----------
/**
 * "छुट्टी 12/10 से 13/10 बीमारी: बुखार", "kal chhutti aadha din", "leave 15/10 casual shaadi".
 * Returns null when it isn't a leave request.
 */
export function parseLeaveText(text: string, today: string): { fromDate: string; toDate: string; halfDay: boolean; type: LeaveType; reason: string } | null {
  const s = text.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).trim();
  const low = s.toLowerCase();
  if (!/छुट्टी|छुटी|अवकाश|chhutti|chutti|chhuti|leave/.test(low)) return null;
  const year = Number(today.slice(0, 4));
  const dates = [...s.matchAll(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/g)].map((m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    let d = `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    if (!m[3] && d < today) d = `${y + 1}${d.slice(4)}`;
    return d;
  });
  let from = dates[0] ?? null;
  if (!from) {
    if (/परसों|parson|parso/.test(low)) from = addDays(today, 2);
    else if (/\bkal\b|कल|tomorrow/.test(low)) from = addDays(today, 1);
    else if (/\baaj\b|आज|today/.test(low)) from = today;
  }
  if (!from) return null;
  const to = dates[1] && dates[1] >= from ? dates[1] : from;
  const halfDay = /आधा|आधे|aadha|adha|half/.test(low);
  const type: LeaveType = /बीमार|bimar|beemar|sick|बुखार|bukhar|fever/.test(low) ? "SICK" : /आकस्मिक|casual|aakasmik/.test(low) ? "CASUAL" : "OTHER";
  const reason = (s.split(/[:：]/).slice(1).join(":").trim() || s).slice(0, 500);
  return { fromDate: from, toDate: to, halfDay, type, reason };
}

/** Owner's reply to a leave: "मंज़ूर 5" / "नामंज़ूर 5" / "approve 5" / "reject 5". */
export function parseLeaveDecision(text: string): { approve: boolean; n: number } | null {
  const s = text.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).trim().toLowerCase();
  const m = s.match(/^(ना\s*मंज़ूर|नामंज़ूर|नामंजूर|na\s*manzoor|namanzoor|reject|मंज़ूर|मंजूर|manzoor|approve|ok)\s*#?(\d{1,4})$/);
  if (!m) return null;
  return { approve: !/ना|na\s*manzoor|namanzoor|reject/.test(m[1]!), n: Number(m[2]) };
}

/** Hindi reply for a punch result (WhatsApp; the web uses its own EN/HI strings). */
export function punchTextHi(r: { ok: boolean; code: string; distanceM?: number; at?: Date }): string {
  const t = r.at ? r.at.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "";
  const far = r.distanceM != null ? ` (लगभग ${Math.round(r.distanceM)} मीटर)` : "";
  switch (r.code) {
    case "haazir":
      return `✅ हाज़िर ${t}`;
    case "late":
      return `✅ हाज़िर ${t} — देर से`;
    case "halfDay":
      return `✅ हाज़िर ${t} — देर ज़्यादा है, आधा दिन गिना जाएगा`;
    case "out":
      return `👋 जाने का समय दर्ज: ${t}`;
    case "field":
      return `✅ बाहर का काम दर्ज: ${t}`;
    case "tooFar":
      return `📍 आप ऑफिस से दूर हैं${far} — बाहर का काम है तो कारण लिखें।`;
    case "already":
      return "आज की यह हाज़िरी पहले ही लग चुकी है।";
    case "tooSoon":
      return "हाज़िरी के 1 घंटे के अंदर जाने का समय दर्ज नहीं होता।";
    case "noIn":
      return "पहले आज की हाज़िरी लगाएँ।";
    case "noOffice":
      return "ऑफिस की लोकेशन अभी सेट नहीं है — मालिक से सेट करवाएँ।";
    case "needReason":
      return "बाहर के काम का कारण लिखें।";
    case "lowAccuracy":
    case "noGps":
      return "📍 लोकेशन सही नहीं मिली — फ़ोन का GPS चालू करके दोबारा भेजें।";
    default:
      return "हाज़िरी दर्ज नहीं हो सकी।";
  }
}
