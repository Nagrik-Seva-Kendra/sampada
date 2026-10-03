import type { FollowUpKind, FollowUpRule } from "@sampada/shared";
import { closedDay, hhmmToMin, istDay, istMinutes } from "../attendance/attendance-rules.js";
import type { AttendanceSettings } from "@sampada/shared";
import { addDay, dayHi } from "./registry-date.js";

/**
 * Pure rules for #6: the call-back time (office hours from the Attendance
 * settings + holiday list) and when a follow-up is due.
 */

// ---------- call ----------
/** OFFICE_CALL_NUMBER (10 digits, or with 91) → "91XXXXXXXXXX"; null hides the call option. */
export function officeCallNumber(env = process.env.OFFICE_CALL_NUMBER): string | null {
  const d = (env ?? "").replace(/\D/g, "");
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d;
  return /^[6-9]\d{9}$/.test(ten) ? `91${ten}` : null;
}
export const showNumber = (n: string) => `+91 ${n.slice(2, 7)} ${n.slice(7)}`;

const ASAP = /^(अभी|abhi|jaldi|जल्दी|कभी भी|kabhi bhi|any ?time|asap|now|तुरंत|turant)[\s!.।]*$/i;
export const saysAsap = (t: string) => ASAP.test(t.trim());

export type OfficeHours = Pick<AttendanceSettings, "startTime" | "endTime" | "weeklyOff">;
const IST_MS = 5.5 * 3600 * 1000;
/** IST day + "HH:MM" → Date. */
export const istAt = (day: string, hhmm: string) => new Date(Date.parse(`${day}T${hhmm}:00Z`) - IST_MS);

export function inOfficeHours(at: Date, h: OfficeHours, holidays: string[]): boolean {
  const day = istDay(at);
  if (closedDay(day, h, holidays)) return false;
  const m = istMinutes(at);
  return m >= hhmmToMin(h.startTime) && m < hhmmToMin(h.endTime);
}

/** The next moment the office is open at or after `at`. */
export function nextOpening(at: Date, h: OfficeHours, holidays: string[]): Date {
  if (inOfficeHours(at, h, holidays)) return at;
  let day = istDay(at);
  if (istMinutes(at) >= hhmmToMin(h.startTime)) day = addDay(day, 1); // after opening time today → from tomorrow
  for (let i = 0; i < 30 && closedDay(day, h, holidays); i++) day = addDay(day, 1);
  return istAt(day, h.startTime);
}

/** "कल 10:00 बजे के बाद" / "15/10/2026 (गुरुवार) 10:00 बजे के बाद". */
export function whenHi(at: Date, now: Date): string {
  const day = istDay(at);
  const t = at.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
  const today = istDay(now);
  const d = day === today ? "आज" : day === addDay(today, 1) ? "कल" : dayHi(day);
  return `${d} ${t} बजे`;
}

// ---------- follow-ups ----------
export const STOP_RE = /^(बंद|बन्द|band|stop|बंद करें|बंद करो|band karo|band kare|unsubscribe|मत भेजें|mat bhejo)[\s!.।]*$/i;
export const WANT_RE = /(करवाना|करना|karwana|karvana|karna)\s*(है|hai|h)?(\s|$|[!.।])|^(हाँ|हां|haan|han|yes)( ?(जी|ji))?[\s!.।]*$/i;

export function effectiveKind(deedType: string | undefined, choice: string | null | undefined): FollowUpKind | null {
  const c = choice ?? "auto";
  if (c === "none") return null;
  if (c === "agreement" || c === "patta") return c;
  if (deedType === "mortgage") return "mortgage";
  if (deedType === "sale" || deedType === undefined) return "sale";
  return null;
}

/**
 * When a follow-up goes (IST day), or null (none / period over). sale: N days
 * after the registry; agreement / patta / mortgage: N days before the term
 * end; mortgage without an end: every year from the registry. A day already
 * passed (the request was closed late) moves to tomorrow while the term runs.
 */
export function followUpDue(
  kind: FollowUpKind,
  rule: Pick<FollowUpRule, "offsetDays" | "enabled">,
  input: { today: string; registryDay: string; termEnd: string | null },
): { dueDate: string; recurring: boolean } | null {
  if (!rule.enabled) return null;
  const { today, registryDay, termEnd } = input;
  const tomorrow = addDay(today, 1);
  if (kind === "sale") {
    const due = addDay(registryDay, rule.offsetDays);
    if (due < today && addDay(due, 30) < today) return null; // long past: don't ask now
    return { dueDate: due < tomorrow ? tomorrow : due, recurring: false };
  }
  if (!termEnd) {
    if (kind !== "mortgage") return null;
    let due = addDay(registryDay, 365);
    while (due < tomorrow) due = addDay(due, 365);
    return { dueDate: due, recurring: true };
  }
  if (termEnd < tomorrow) return null;
  const due = addDay(termEnd, -rule.offsetDays);
  return { dueDate: due < tomorrow ? tomorrow : due, recurring: false };
}

export function followUpText(rule: Pick<FollowUpRule, "text">, v: { name: string | null; ref: string; date: string }): string {
  return rule.text
    .replace(/\{name\}/g, v.name?.trim() || "जी")
    .replace(/\{ref\}/g, v.ref)
    .replace(/\{date\}/g, `${v.date.slice(8, 10)}/${v.date.slice(5, 7)}/${v.date.slice(0, 4)}`);
}

export const FOLLOW_UP_LABEL_HI: Record<FollowUpKind, string> = {
  agreement: "नया अनुबंध",
  mortgage: "बंधक मुक्ति (री-कन्वेयन्स)",
  patta: "पट्टा नवीनीकरण",
  sale: "नामांतरण (mutation)",
};
