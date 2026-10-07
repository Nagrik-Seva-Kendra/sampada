/**
 * The owner's weekly report on WhatsApp (weekly-report.spec.ts): every Monday
 * from WA_WEEKLY_REPORT_TIME (IST, default 09:30), or on "हफ़्ते की रिपोर्ट".
 * Counts only -- customers appear as numbers of questions, never by name. Pure.
 */
import { istDayStart } from "../tasks/task-rules.js";

const IST_MS = 5.5 * 3600_000;

export interface WeeklyStats {
  /** Numbers that wrote to the bot in the last 7 days (owners left out). */
  writers: number;
  newRequests: number;
  done: number;
  ratings: { count: number; avg: number | null };
  questions: { asked: number; answered: number; open: number };
  /** Times the bot gave a remembered answer (all time: uses are counted, not dated). */
  learnedUsed: number;
  nudges: number;
  /** Open tasks per staff member (unassigned as "बिना नाम"), and how many are overdue. */
  staff: { name: string; open: number; overdue: number }[];
}

/** "हफ़्ते की रिपोर्ट", "weekly report", "साप्ताहिक रिपोर्ट". */
export const isWeeklyReportAsk = (text: string): boolean =>
  /^(हफ़्ते|हफ्ते|हफ्ता|hafte|hafta|week|weekly|साप्ताहिक|saptahik)\s*(की|ki|ka|का)?\s*(रिपोर्ट|report)[\s?।.!]*$/i.test(text.trim());

/** WA_WEEKLY_REPORT_TIME "HH:MM" IST → minutes (default 09:30). */
export function reportMinutes(env = process.env.WA_WEEKLY_REPORT_TIME): number {
  const m = (env ?? "").match(/^(\d{1,2}):(\d{2})$/);
  const h = m ? Number(m[1]) : 9;
  const min = m ? Number(m[2]) : 30;
  return h < 24 && min < 60 ? h * 60 + min : 570;
}

/** Monday (IST) from the report time, once that Monday. */
export function weeklyDue(now: Date, lastRunAt: Date | null, at = reportMinutes()): boolean {
  const ist = new Date(now.getTime() + IST_MS);
  if (ist.getUTCDay() !== 1) return false;
  if (ist.getUTCHours() * 60 + ist.getUTCMinutes() < at) return false;
  return !lastRunAt || lastRunAt < istDayStart(now);
}

const inr = (n: number) => n.toLocaleString("en-IN");

export function weeklyReportText(s: WeeklyStats, openQuestions: string | null): string {
  const lines = [
    "📊 पिछले 7 दिन की रिपोर्ट",
    "",
    "👥 ग्राहक",
    `• बॉट पर लिखने वाले नंबर: ${inr(s.writers)}`,
    `• नए अनुरोध (कागज़ भेजे): ${inr(s.newRequests)}`,
    `• काम पूरे हुए: ${inr(s.done)}`,
    s.ratings.count ? `• रेटिंग: ${s.ratings.avg!.toFixed(1)} ⭐ (${s.ratings.count} ग्राहक)` : "• रेटिंग: इस हफ़्ते कोई नहीं",
    `• अधूरे ग्राहकों को याद दिलाया: ${inr(s.nudges)}`,
    "",
    "❓ सवाल",
    `• बॉट जवाब नहीं दे पाया: ${inr(s.questions.asked)} (आपने जवाब दिया: ${inr(s.questions.answered)})`,
    `• याद रखे जवाब बॉट ने खुद दिए (अब तक कुल): ${inr(s.learnedUsed)}`,
    `• अभी खुले सवाल: ${inr(s.questions.open)}${s.questions.open ? ' — देखने के लिए "सवाल" लिखें' : ""}`,
  ];
  if (openQuestions && s.questions.open) lines.push("", openQuestions);
  lines.push("", "🧑‍💼 स्टाफ के बाकी काम");
  if (!s.staff.length) lines.push("• कोई काम बाकी नहीं ✅");
  for (const st of s.staff) lines.push(`• ${st.name}: ${st.open}${st.overdue ? ` (${st.overdue} देर से)` : ""}`);
  return lines.join("\n");
}
