/**
 * "आपने आज IN / OUT नहीं लगाया" to staff on WhatsApp (pure; attendance-reminders.spec.ts).
 * Sent by AttendanceJobsService at the owner-report times (start + 30 min, end + 60 min).
 */
import type { AttendanceSettings, DayStatus } from "@sampada/shared";

export type ReminderKind = "IN" | "OUT";

export interface ReminderStaff {
  userId: string;
  name: string;
  firstName: string;
  phone: string | null;
}
export interface ReminderDay {
  status: DayStatus;
  inAt: string | null;
  outAt: string | null;
}

/** Leave (full or half), half day, weekly off / holiday, field work: no reminder. */
const NO_DUTY: DayStatus[] = ["leave", "halfLeave", "halfDay", "off", "holiday", "future", "field"];

/**
 * Who gets the reminder: IN -- not punched in today; OUT -- punched in, not out.
 * Others with a reason (shown to the owner): switched off, no mobile.
 */
export function reminderTargets(
  staff: ReminderStaff[],
  dayOf: (userId: string) => ReminderDay | undefined,
  kind: ReminderKind,
  settings: Pick<AttendanceSettings, "reminderSkipUserIds">,
): { send: ReminderStaff[]; skipped: { name: string; reason: string }[] } {
  const send: ReminderStaff[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const s of staff) {
    const d = dayOf(s.userId);
    if (!d || NO_DUTY.includes(d.status)) continue;
    const missing = kind === "IN" ? !d.inAt : !!d.inAt && !d.outAt;
    if (!missing) continue;
    if (settings.reminderSkipUserIds.includes(s.userId)) skipped.push({ name: s.name, reason: "reminder बंद" });
    else if (!s.phone) skipped.push({ name: s.name, reason: "मोबाइल नहीं" });
    else send.push(s);
  }
  return { send, skipped };
}

/** Plain text inside the 24h window; the staff reply "IN" / "OUT" goes to staff mode. */
export const reminderText = (firstName: string, kind: ReminderKind) =>
  `नमस्ते ${firstName}, आपने आज ${kind} अटेंडेंस नहीं लगाई है। कृपया "${kind}" लिखकर भेज दें।`;

/** One line for the owner's report: how many got it, who did not and why. */
export function reminderSummary(kind: ReminderKind, sent: string[], failed: { name: string; reason: string }[]): string | null {
  if (!sent.length && !failed.length) return null;
  const parts = [`📨 ${kind} reminder: ${sent.length} स्टाफ को भेजा`];
  if (failed.length) parts.push(`${failed.length} को नहीं — ${failed.map((f) => `${f.name} (${f.reason})`).join(", ")}`);
  return parts.join("; ");
}
