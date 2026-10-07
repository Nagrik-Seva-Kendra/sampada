/**
 * The owner's evening summary on WhatsApp (daily-summary.spec.ts): every day
 * from WA_DAILY_SUMMARY_TIME (IST, default 20:30), or on "सारांश". Counts and
 * staff names only -- no amounts, no customer numbers. Pure.
 */
import { istDayStart } from "../tasks/task-rules.js";

const IST_MS = 5.5 * 3600_000;

export interface DailyStats {
  /** Requests (drafts) started today. */
  created: number;
  /** Requests finished today (DONE / REJECTED). */
  closed: number;
  /** Submitted requests still open (any day). */
  pending: number;
  attendance: { off: boolean; noIn: string[]; noOut: string[] } | null;
}

/** "सारांश", "आज का सारांश", "summary", "aaj ka hisab". */
export const isSummaryAsk = (text: string): boolean =>
  /^(आज\s*का\s*)?(सारांश|saransh|saaransh|summary|हिसाब|हिसाब\s*किताब|hisab|hisaab)[\s?।.!]*$/i.test(text.trim()) ||
  /^(aaj|आज)\s*(ka|का)\s*(saransh|summary|hisab|hisaab)[\s?।.!]*$/i.test(text.trim());

/** WA_DAILY_SUMMARY_TIME "HH:MM" IST → minutes (default 20:30). */
export function summaryMinutes(env = process.env.WA_DAILY_SUMMARY_TIME): number {
  const m = (env ?? "").match(/^(\d{1,2}):(\d{2})$/);
  const h = m ? Number(m[1]) : 20;
  const min = m ? Number(m[2]) : 30;
  return h < 24 && min < 60 ? h * 60 + min : 20 * 60 + 30;
}

/** From the summary time until midnight (IST), once that day. */
export function summaryDue(now: Date, lastRunAt: Date | null, at = summaryMinutes()): boolean {
  const ist = new Date(now.getTime() + IST_MS);
  if (ist.getUTCHours() * 60 + ist.getUTCMinutes() < at) return false;
  return !lastRunAt || lastRunAt < istDayStart(now);
}

/** "08/10/2026" (IST). */
export const istDdMmYyyy = (d: Date): string => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10).split("-").reverse().join("/");

/** The attendance line, short (also the template's {{5}}: one line, no line breaks). */
export function attendanceLine(a: DailyStats["attendance"]): string {
  if (!a) return "जानकारी नहीं मिली";
  if (a.off) return "आज छुट्टी";
  const parts = [a.noIn.length ? `IN नहीं लगाई ${a.noIn.join(", ")}` : "", a.noOut.length ? `OUT नहीं लगाई ${a.noOut.join(", ")}` : ""].filter(Boolean);
  return parts.length ? parts.join("; ") : "सबकी पूरी";
}

export function summaryText(s: DailyStats, now: Date): string {
  return [
    `🌙 आज का सारांश (${istDdMmYyyy(now)})`,
    `📥 नए अनुरोध: ${s.created} · ✅ पूरे: ${s.closed} · ⏳ बाकी: ${s.pending}`,
    `🕘 हाज़िरी: ${attendanceLine(s.attendance)}`,
    'कभी भी "सारांश" लिखकर देखें।',
  ].join("\n");
}

/** Template params: date, created, closed, pending, attendance. */
export const summaryParams = (s: DailyStats, now: Date): string[] => [istDdMmYyyy(now), String(s.created), String(s.closed), String(s.pending), attendanceLine(s.attendance)];
