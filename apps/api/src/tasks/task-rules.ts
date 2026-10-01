/**
 * Pure rules for the owner's WhatsApp to-do assistant (task-rules.spec.ts):
 * owner commands ("3 हो गया", "3 कल", "सब स्टाफ को: ..."), Hindi/Hinglish due
 * dates in IST, the model's extraction, and the messages. No Nest/Prisma.
 */
import { TASK_WORK_LABEL_HI, TaskWorkType } from "@sampada/shared";

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const norm = (s: string) => s.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).trim().toLowerCase().replace(/\s+/g, " ");

/** Wall-clock parts in IST. */
function ist(d: Date) {
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), dow: x.getUTCDay(), h: x.getUTCHours() };
}
/** IST wall clock → UTC Date. */
export function istDate(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m, d, h, min) - IST_OFFSET_MS);
}
/** Start of the IST day containing `d`. */
export function istDayStart(d: Date): Date {
  const p = ist(d);
  return istDate(p.y, p.m, p.d);
}

const WEEKDAYS: [RegExp, number][] = [
  [/रविवार|इतवार|ravivar|raviwar|itwar|sunday/, 0],
  [/सोमवार|somvar|somwar|monday/, 1],
  [/मंगलवार|mangalvar|mangalwar|tuesday/, 2],
  [/बुधवार|budhvar|budhwar|wednesday/, 3],
  [/गुरुवार|बृहस्पतिवार|guruvar|guruwar|thursday/, 4],
  [/शुक्रवार|shukravar|shukrawar|friday/, 5],
  [/शनिवार|shanivar|shaniwar|saturday/, 6],
];

/**
 * A due date/time from Hindi/Hinglish words, relative to `now` (IST):
 * आज/kal/परसों, weekdays ("सोमवार तक" = the next Monday), "15 तारीख", 15/10,
 * and सुबह (10), दोपहर (13), शाम (18), रात (20), "5 बजे". A day without a time
 * means 18:00 (end of the working day). null when nothing is recognised.
 */
export function parseDue(text: string, now: Date): Date | null {
  const s = norm(text);
  const p = ist(now);
  let day: { y: number; m: number; d: number } | null = null;
  if (/परसों|parson|parso/.test(s)) day = { y: p.y, m: p.m, d: p.d + 2 };
  else if (/\bkal\b|कल/.test(s)) day = { y: p.y, m: p.m, d: p.d + 1 };
  else if (/\baaj\b|आज|today/.test(s)) day = { y: p.y, m: p.m, d: p.d };
  else if (/tomorrow/.test(s)) day = { y: p.y, m: p.m, d: p.d + 1 };
  if (!day) {
    const wd = WEEKDAYS.find(([re]) => re.test(s));
    if (wd) {
      let add = (wd[1] - p.dow + 7) % 7;
      if (add === 0) add = 7;
      day = { y: p.y, m: p.m, d: p.d + add };
    }
  }
  if (!day) {
    const dm = s.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
    const tarikh = s.match(/\b(\d{1,2})\s*(तारीख|तारिख|tarikh|tareekh|tarik)/);
    if (dm) {
      const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : p.y;
      day = { y, m: Number(dm[2]) - 1, d: Number(dm[1]) };
      if (!dm[3] && istDate(day.y, day.m, day.d, 23) < now) day.y += 1;
    } else if (tarikh) {
      day = { y: p.y, m: p.m, d: Number(tarikh[1]) };
      if (istDate(day.y, day.m, day.d, 23) < now) day.m += 1;
    }
  }
  let hour: number | null = null;
  const baje = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(बजे|baje|bje|pm|am)/);
  if (baje) {
    hour = Number(baje[1]);
    if ((baje[3] === "pm" || (baje[3] !== "am" && hour >= 1 && hour <= 7)) && hour < 12) hour += 12;
  } else if (/सुबह|subah|subha|morning/.test(s)) hour = 10;
  else if (/दोपहर|dopahar|dopehar|afternoon/.test(s)) hour = 13;
  else if (/शाम|shaam|sham|evening/.test(s)) hour = 18;
  else if (/रात|raat|night/.test(s)) hour = 20;
  if (!day && hour == null) return null;
  const base = day ?? { y: p.y, m: p.m, d: p.d };
  const out = istDate(base.y, base.m, base.d, hour ?? 18, baje?.[2] ? Number(baje[2]) : 0);
  // "5 बजे" with no day, already past → tomorrow.
  if (!day && out < now) return istDate(base.y, base.m, base.d + 1, hour ?? 18);
  return out;
}

export type OwnerCommand =
  | { kind: "done"; n: number }
  | { kind: "cancel"; n: number }
  | { kind: "due"; n: number; due: Date }
  | { kind: "list" }
  | { kind: "broadcast"; message: string }
  | { kind: "customerMode" }
  | { kind: "ownerMode" };

const END = "(?=$|[\\s.!।,])";
const DONE_WORDS = new RegExp(`^(हो गया|हो गयी|हो गई|ho gaya|ho gya|hogaya|ho gayi|done|पूरा हो गया|पूरा|complete|completed)${END}`);

/** The owner's quick commands; null → treat the text as a new task. */
export function parseOwnerCommand(text: string, now: Date): OwnerCommand | null {
  const s = norm(text);
  if (/^(ग्राहक|grahak|customer)\s*(मोड|mode)$/.test(s)) return { kind: "customerMode" };
  if (/^(ओनर|owner|मालिक|malik)\s*(मोड|mode)$/.test(s)) return { kind: "ownerMode" };
  if (/^(काम|kaam|list|सूची|aaj ke kaam|आज के काम|kaam batao|काम बताओ|tasks?)$/.test(s)) return { kind: "list" };
  const b = text.trim().match(/^(सब|सभी|sab|sabhi|all)\s*(staff|स्टाफ)\s*(को|ko|to)?\s*[:：\-–]?\s*([\s\S]+)$/i);
  if (b && b[4]!.trim().length >= 2) return { kind: "broadcast", message: b[4]!.trim() };
  const m = s.match(/^#?(\d{1,4})\s+(.+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  const rest = m[2]!;
  if (DONE_WORDS.test(rest)) return { kind: "done", n };
  if (new RegExp(`^(रद्द|radd|cancel|cancelled|हटाओ|hatao)${END}`).test(rest)) return { kind: "cancel", n };
  const due = parseDue(rest, now);
  return due ? { kind: "due", n, due } : null;
}

/** A staff member's reply: "हो गया" (their only/newest open task) or "12 हो गया". */
export function parseStaffDone(text: string): { n: number | null } | null {
  const s = norm(text);
  const m = s.match(/^#?(\d{1,4})\s+(.+)$/);
  if (m && DONE_WORDS.test(m[2]!)) return { n: Number(m[1]) };
  return DONE_WORDS.test(s) ? { n: null } : null;
}

// ---------- the model's extraction ----------
export interface TaskDraft {
  title: string;
  partyName: string | null;
  partyPhone: string | null;
  workType: TaskWorkType;
  place: string | null;
  dueAt: string | null;
  note: string | null;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

/**
 * Validates the model's JSON. The due date comes from our own parser on the
 * phrase the model quoted ("सोमवार तक"); unsure fields stay empty.
 */
export function mapTaskExtract(raw: unknown, now: Date): TaskDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const wt = TaskWorkType.safeParse(r.workType);
  const digits = typeof r.partyPhone === "string" ? r.partyPhone.replace(/\D/g, "") : "";
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  const partyPhone = /^[6-9]\d{9}$/.test(ten) ? `91${ten}` : null;
  const dueText = str(r.dueText, 80);
  const due = dueText ? parseDue(dueText, now) : null;
  const workType = wt.success ? wt.data : "other";
  const partyName = str(r.partyName, 120);
  const title = str(r.title, 200) ?? [partyName, TASK_WORK_LABEL_HI[workType]].filter(Boolean).join(" — ");
  if (!title) return null;
  return {
    title,
    partyName,
    partyPhone,
    workType,
    place: str(r.place, 200),
    dueAt: due ? due.toISOString() : null,
    note: str(r.note, 1000),
  };
}

// ---------- messages ----------
export function formatDueHi(iso: string | null): string {
  if (!iso) return "तारीख नहीं";
  return new Date(iso).toLocaleString("hi-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function confirmText(d: TaskDraft): string {
  const party = d.partyName ?? "पार्टी का नाम नहीं";
  const lines = [`काम दर्ज: ${party} - ${TASK_WORK_LABEL_HI[d.workType]} - ${formatDueHi(d.dueAt)}`];
  if (d.partyPhone) lines.push(`मोबाइल: ${d.partyPhone.slice(2)}`);
  if (d.place) lines.push(`जगह: ${d.place}`);
  if (d.note) lines.push(`नोट: ${d.note}`);
  lines.push('ठीक? "हाँ" / "बदलें" / "रद्द"');
  return lines.join("\n");
}

export interface DigestTask {
  number: number;
  title: string;
  dueAt: Date | null;
  assigneeName?: string | null;
}

/** Morning list: overdue first, then today's. Empty string when nothing is due. */
export function digestText(tasks: DigestTask[], now: Date): string {
  const today = istDayStart(now);
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < today);
  const due = tasks.filter((t) => t.dueAt && t.dueAt >= today && t.dueAt < tomorrow);
  if (!overdue.length && !due.length) return "";
  const line = (t: DigestTask) =>
    `${t.number}. ${t.title} — ${formatDueHi(t.dueAt!.toISOString())}${t.assigneeName ? ` (${t.assigneeName})` : ""}`;
  const out = ["🗒️ आज के काम"];
  if (overdue.length) out.push("", `⏰ पुराने बाकी (${overdue.length}):`, ...overdue.map(line));
  if (due.length) out.push("", `आज (${due.length}):`, ...due.map(line));
  out.push("", 'पूरा होने पर "3 हो गया", तारीख बदलने के लिए "3 कल" लिखें।');
  return out.join("\n");
}
