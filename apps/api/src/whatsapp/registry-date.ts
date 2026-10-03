/**
 * Registry date the customer would like (WhatsApp flow): Hindi / Hinglish
 * date words → IST day "YYYY-MM-DD", and the office's checks on it. Pure
 * functions -- the caller passes "today" and the holiday list.
 */

const DEV = "०१२३४५६७८९";
const norm = (t: string) =>
  t
    .replace(/[०-९]/g, (d) => String(DEV.indexOf(d)))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const addDay = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();
export const istToday = (now = new Date()): string => new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const WEEKDAYS: [RegExp, number][] = [
  [/रविवार|इतवार|ravivar|itwar|sunday/, 0],
  [/सोमवार|somvar|somwar|monday/, 1],
  [/मंगलवार|mangalvar|mangalwar|tuesday/, 2],
  [/बुधवार|budhvar|budhwar|wednesday/, 3],
  [/गुरुवार|बृहस्पतिवार|guruvar|guruwar|thursday/, 4],
  [/शुक्रवार|shukravar|shukrawar|friday/, 5],
  [/शनिवार|shanivar|shaniwar|saturday/, 6],
];
const MONTHS: [RegExp, number][] = [
  [/जनवरी|january|jan\b/, 1],
  [/फ़रवरी|फरवरी|february|feb\b/, 2],
  [/मार्च|march|mar\b/, 3],
  [/अप्रैल|अप्रेल|april|apr\b/, 4],
  [/मई|\bmay\b/, 5],
  [/जून|june|jun\b/, 6],
  [/जुलाई|july|jul\b/, 7],
  [/अगस्त|august|aug\b/, 8],
  [/सितंबर|सितम्बर|september|sept?\b/, 9],
  [/अक्टूबर|अक्तूबर|october|oct\b/, 10],
  [/नवंबर|नवम्बर|november|nov\b/, 11],
  [/दिसंबर|दिसम्बर|december|dec\b/, 12],
];

const ymd = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // 31/02 ...
  return dt.toISOString().slice(0, 10);
};

/** A day from "15/10", "15-10-2026", "15 अक्टूबर", "15 तारीख", आज/कल/परसों, "(अगले) सोमवार"; null if none. */
export function parseRegistryDate(text: string, today: string): string | null {
  const s = norm(text);
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const future = (d: string | null, bump: () => string | null) => (d && d < today ? bump() : d);

  const dm = s.match(/(?:^|[^\d])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?!\d)/);
  if (dm) {
    const d = Number(dm[1]);
    const m = Number(dm[2]);
    if (dm[3]) return ymd(dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]), m, d);
    return future(ymd(ty, m, d), () => ymd(ty + 1, m, d));
  }
  const month = MONTHS.find(([re]) => re.test(s));
  const num = s.match(/(?:^|[^\d])(\d{1,2})(?!\d)/);
  if (month && num) {
    const yr = s.match(/(20\d{2})/);
    if (yr) return ymd(Number(yr[1]), month[1], Number(num[1]));
    return future(ymd(ty, month[1], Number(num[1])), () => ymd(ty + 1, month[1], Number(num[1])));
  }
  const tarikh = s.match(/(\d{1,2})\s*(?:तारीख|तारिख|tarikh|tareekh|tarik)/);
  if (tarikh) {
    const d = Number(tarikh[1]);
    return future(ymd(ty, tm, d), () => (tm === 12 ? ymd(ty + 1, 1, d) : ymd(ty, tm + 1, d)));
  }
  if (/परसों|parson|parso/.test(s)) return addDay(today, 2);
  if (/(^|\s)(kal|कल)($|\s)|tomorrow/.test(s)) return addDay(today, 1);
  if (/(^|\s)(aaj|आज)($|\s)|today/.test(s)) return today;
  const wd = WEEKDAYS.find(([re]) => re.test(s));
  if (wd) {
    let add = (wd[1] - weekdayOf(today) + 7) % 7;
    if (add === 0) add = 7;
    // "अगले सोमवार" on a Saturday is the coming Monday; "अगले हफ़्ते सोमवार" is a week later.
    if (/(हफ़्ते|हफ्ते|सप्ताह|hafte|week)/.test(s)) add += 7;
    return addDay(today, add);
  }
  return null;
}

/** सुबह / दोपहर in the same message (or "1" / "2" when asked). */
export function parseTimeOfDay(text: string): "MORNING" | "AFTERNOON" | null {
  const s = norm(text);
  if (/^1[.)]?$|सुबह|सुबे|subah|subha|morning/.test(s)) return "MORNING";
  if (/^2[.)]?$|दोपहर|दुपहर|dopahar|dopehar|dophar|afternoon|शाम|sham/.test(s)) return "AFTERNOON";
  return null;
}

export interface RegistryRules {
  /** Working days between today and the registry (default 2). */
  minWorkingDays: number;
  /** At most this many days ahead (default 60). */
  maxDays: number;
  /** Closed weekdays (0 = Sunday). */
  weeklyOff: number[];
  /** Owner's holiday list, "YYYY-MM-DD". */
  holidays: string[];
}

export function registryRules(holidays: string[]): RegistryRules {
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    minWorkingDays: n(process.env.REGISTRY_MIN_WORKING_DAYS, 2),
    maxDays: n(process.env.REGISTRY_MAX_DAYS, 60),
    weeklyOff: [0],
    holidays,
  };
}

const closed = (day: string, r: RegistryRules) => r.weeklyOff.includes(weekdayOf(day)) || r.holidays.includes(day);

/** The first open day on or after `day`. */
export function nextOpenDay(day: string, r: RegistryRules): string {
  let d = day;
  for (let i = 0; i < 60 && closed(d, r); i++) d = addDay(d, 1);
  return d;
}

/** The earliest allowed day: `minWorkingDays` open days after today. */
export function earliestDay(today: string, r: RegistryRules): string {
  let d = today;
  let n = 0;
  while (n < Math.max(1, r.minWorkingDays)) {
    d = addDay(d, 1);
    if (!closed(d, r)) n++;
  }
  return d;
}

export type DateCheck =
  | { ok: true; day: string; newRatesWarning: boolean }
  | { ok: false; code: "past" | "closed" | "tooSoon" | "tooFar"; suggest: string | null; holiday?: boolean };

/** Is 1 April (new guideline rates) between today and the day? */
export function crossesNewRates(today: string, day: string): boolean {
  const y = Number(today.slice(0, 4));
  const april = today.slice(5) >= "04-01" ? `${y + 1}-04-01` : `${y}-04-01`;
  return day >= april;
}

export function checkRegistryDate(day: string, today: string, r: RegistryRules): DateCheck {
  const earliest = earliestDay(today, r);
  const latest = addDay(today, r.maxDays);
  const suggestFrom = (d: string) => {
    const s = nextOpenDay(d < earliest ? earliest : d, r);
    return s <= latest ? s : null;
  };
  if (day < today) return { ok: false, code: "past", suggest: suggestFrom(earliest) };
  if (day > latest) return { ok: false, code: "tooFar", suggest: null };
  if (day < earliest) return { ok: false, code: "tooSoon", suggest: suggestFrom(earliest) };
  if (closed(day, r)) return { ok: false, code: "closed", suggest: suggestFrom(day), holiday: r.holidays.includes(day) };
  return { ok: true, day, newRatesWarning: crossesNewRates(today, day) };
}

const DAY_HI = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
/** "15/10/2026 (गुरुवार)" */
export function dayHi(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)} (${DAY_HI[weekdayOf(day)]})`;
}
export const TIME_OF_DAY_HI = { MORNING: "सुबह", AFTERNOON: "दोपहर" } as const;

/** Customer message for a refused date. */
export function dateProblemHi(c: Extract<DateCheck, { ok: false }>, r: RegistryRules): string {
  const why =
    c.code === "past"
      ? "यह तारीख निकल चुकी है।"
      : c.code === "tooFar"
        ? `रजिस्ट्री की तारीख आज से ${r.maxDays} दिन के अंदर की चुनें।`
        : c.code === "tooSoon"
          ? `रजिस्ट्री की तैयारी के लिए कम से कम ${r.minWorkingDays} कामकाजी दिन चाहिए।`
          : c.holiday
            ? "उस दिन अवकाश है, रजिस्ट्री नहीं होगी।"
            : "रविवार को रजिस्ट्री नहीं होती।";
  return c.suggest
    ? `${why}\nसबसे पास की खुली तारीख: ${dayHi(c.suggest)}\nयह ठीक है तो "हाँ" लिखें, या दूसरी तारीख लिखें।`
    : `${why}\nकृपया दूसरी तारीख लिखें (जैसे 15/10)।`;
}

export const NEW_RATES_WARNING =
  "ध्यान दें: 1 अप्रैल से नई गाइडलाइन दरें लागू हो सकती हैं — तब स्टाम्प शुल्क बदल सकता है। स्टाफ अंतिम राशि बताएगा।";
