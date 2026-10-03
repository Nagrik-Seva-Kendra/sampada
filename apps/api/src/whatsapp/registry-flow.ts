import {
  checkRegistryDate,
  dateProblemHi,
  dayHi,
  NEW_RATES_WARNING,
  parseRegistryDate,
  parseTimeOfDay,
  type RegistryRules,
  TIME_OF_DAY_HI,
} from "./registry-date.js";

/**
 * The last questions before the summary: preferred registry date, an optional
 * second date, morning / afternoon, and who takes the geo-tag photo. Pure --
 * the intake service saves `data` and moves on when `done` is true.
 */
export const REGISTRY_STEPS = ["REG_DATE", "REG_ALT", "REG_TIME", "GEOTAG"] as const;
export type RegistryStep = (typeof REGISTRY_STEPS)[number];
export const isRegistryStep = (s: string): s is RegistryStep => (REGISTRY_STEPS as readonly string[]).includes(s);
export const REGISTRY_KEEP = ["regDate", "regAlt", "regTime", "geoTagMode", "regRulesShown"];

const YES = /^(हाँ|हां|हा|ha|haan|han|yes|y|ok|ठीक है|ठीक|सही)[\s!.।]*$/i;
const NO = /^(नहीं|नही|no|n|nahi|nahin|नहीं चाहिए|कोई नहीं|koi nahi)[\s!.।]*$/i;
const UNKNOWN = /^(पता नहीं|पता नही|बाद में|बाद मे|बादमें|abhi nahi|अभी नहीं|अभी तय नहीं|pata nahi|baad me|baad mein|later|tay nahi)[\s!.।]*$/i;

export interface GeoTagConfig {
  contact: string;
  fee: number;
  appUrl: string | null;
}
export function geoTagConfig(): GeoTagConfig {
  const contact = (process.env.GEOTAG_CONTACT ?? "7222901063").replace(/\D/g, "").slice(-10) || "7222901063";
  const fee = Number(process.env.GEOTAG_FEE ?? 250);
  const appUrl = process.env.GEOTAG_APP_URL?.trim();
  return { contact, fee: Number.isFinite(fee) && fee >= 0 ? fee : 250, appUrl: appUrl && /^https:\/\//.test(appUrl) ? appUrl : null };
}

/** The next registry question, or null when all are answered. */
export function registryNext(d: any): RegistryStep | null {
  if (!("regDate" in d)) return "REG_DATE";
  if (d.regDate && !("regAlt" in d)) return "REG_ALT";
  if (d.regDate && !d.regTime) return "REG_TIME";
  if (!d.geoTagMode) return "GEOTAG";
  return null;
}

export const ID_REMINDER = "📌 रजिस्ट्री के दिन सभी पक्षकार (क्रेता, विक्रेता) और 2 गवाह अपना मूल पहचान पत्र (आधार कार्ड, PAN कार्ड) साथ लाएँ।";

export function geoTagAsk(c = geoTagConfig()): string {
  return [
    "संपत्ति की जियो-टैग फ़ोटो कैसे करवाना चाहेंगे? नंबर लिखें:",
    `1. खुद — संपदा 2.0 ऐप से फ़ोटो लें${c.appUrl ? ` (ऐप: ${c.appUrl})` : ""}`,
    `2. ऑफिस स्टाफ से — शुल्क ₹${c.fee} प्रति फ़ोटो। संपर्क: ${c.contact} (https://wa.me/91${c.contact})`,
  ].join("\n");
}

export function registryAsk(step: RegistryStep, d: any): string {
  switch (step) {
    case "REG_DATE":
      return 'रजिस्ट्री किस तारीख को करवाना चाहेंगे? तारीख लिखें — जैसे 15/10, "कल", "परसों" या "अगले सोमवार"।\nअभी तय नहीं है तो "पता नहीं" लिखें।';
    case "REG_ALT":
      return 'अगर उस दिन न हो पाए तो कोई दूसरी तारीख? तारीख लिखें, या "नहीं" लिखें।';
    case "REG_TIME":
      return "रजिस्ट्री किस समय? नंबर लिखें:\n1. सुबह\n2. दोपहर";
    case "GEOTAG":
      return (d.regRulesShown ? "" : `${ID_REMINDER}\n\n`) + geoTagAsk();
  }
}

export interface RegistryAnswer {
  data: any;
  /** Messages to send before the next question (or instead of it when not done). */
  replies: string[];
  done: boolean;
}

/** One answer to a registry question. */
export function registryAnswer(step: RegistryStep, data: any, raw: string, today: string, rules: RegistryRules): RegistryAnswer {
  const d = { ...data };
  const v = raw.trim();
  const again = (msg: string): RegistryAnswer => ({ data: d, replies: [msg], done: false });

  if (step === "REG_DATE" || step === "REG_ALT") {
    const alt = step === "REG_ALT";
    let day: string | null = null;
    if (d.regSuggest && YES.test(v)) day = d.regSuggest;
    else if (alt ? NO.test(v) || UNKNOWN.test(v) : UNKNOWN.test(v)) {
      delete d.regSuggest;
      if (alt) d.regAlt = null;
      else Object.assign(d, { regDate: null, regAlt: null, regTime: null });
      return { data: d, replies: [], done: true };
    } else day = parseRegistryDate(v, today);
    if (!day) return again(`तारीख समझ नहीं आई। जैसे 15/10, 15 अक्टूबर, "कल" या "अगले सोमवार" लिखें।${alt ? ' दूसरी तारीख न हो तो "नहीं" लिखें।' : ""}`);
    if (alt && day === d.regDate) return again('यह वही तारीख है। कोई दूसरी तारीख लिखें, या "नहीं" लिखें।');
    const c = checkRegistryDate(day, today, rules);
    if (!c.ok) {
      d.regSuggest = c.suggest;
      return again(dateProblemHi(c, rules));
    }
    delete d.regSuggest;
    if (alt) d.regAlt = day;
    else {
      d.regDate = day;
      const tod = parseTimeOfDay(v.replace(/\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?/, ""));
      if (tod && !/^\s*[12][.)]?\s*$/.test(v)) d.regTime = tod;
    }
    const replies = [`✅ ${alt ? "दूसरी तारीख" : "रजिस्ट्री की तारीख"}: ${dayHi(day)}`];
    if (c.newRatesWarning && !d.newRatesWarned) {
      replies.push(NEW_RATES_WARNING);
      d.newRatesWarned = true;
    }
    return { data: d, replies, done: true };
  }
  if (step === "REG_TIME") {
    const tod = parseTimeOfDay(v);
    if (!tod) return again('कृपया "1" (सुबह) या "2" (दोपहर) लिखें।');
    d.regTime = tod;
    return { data: d, replies: [], done: true };
  }
  // GEOTAG
  d.regRulesShown = true;
  const s = v.toLowerCase();
  const mode = /^1[.)]?$|खुद|स्वयं|khud|self|ऐप|app/.test(s) ? "SELF" : /^2[.)]?$|स्टाफ|staff|ऑफिस|office/.test(s) ? "STAFF" : null;
  if (!mode) return again('कृपया "1" (खुद, ऐप से) या "2" (ऑफिस स्टाफ से) लिखें।');
  d.geoTagMode = mode;
  const c = geoTagConfig();
  return {
    data: d,
    replies: [mode === "STAFF" ? `ठीक है, जियो-टैग फ़ोटो के लिए स्टाफ आपसे संपर्क करेगा (₹${c.fee} प्रति फ़ोटो)।` : "ठीक है, जियो-टैग फ़ोटो आप संपदा 2.0 ऐप से लेंगे।"],
    done: true,
  };
}

/** Lines for the summary the customer confirms. */
export function registrySummaryLines(d: any): string[] {
  const out: string[] = [];
  if ("regDate" in d) {
    out.push(
      d.regDate
        ? `रजिस्ट्री की तारीख: ${dayHi(d.regDate)}${d.regTime ? `, ${TIME_OF_DAY_HI[d.regTime as "MORNING" | "AFTERNOON"]}` : ""}`
        : "रजिस्ट्री की तारीख: अभी तय नहीं",
    );
    if (d.regAlt) out.push(`दूसरी तारीख: ${dayHi(d.regAlt)}`);
  }
  if (d.geoTagMode) out.push(`जियो-टैग फ़ोटो: ${d.geoTagMode === "STAFF" ? `ऑफिस स्टाफ से (₹${geoTagConfig().fee} प्रति फ़ोटो)` : "खुद, संपदा 2.0 ऐप से"}`);
  return out;
}

// ---------- office side: confirmed date, day-before reminder ----------
/** "15/10/2026 (गुरुवार), 11:00 बजे" */
export function registryWhenHi(date: string, time: string | null): string {
  return `${dayHi(date)}${time ? `, ${time} बजे` : ""}`;
}

export function registryConfirmText(ref: string, date: string, time: string | null): string {
  return [
    "नमस्ते, नागरिक सेवा केंद्र से सूचना:",
    `अनुरोध नंबर ${ref} की रजिस्ट्री ${registryWhenHi(date, time)} को तय हुई है।`,
    ID_REMINDER,
    "धन्यवाद।",
  ].join("\n");
}

/** Extra line of the day-before reminder: SELF asks about the photo, STAFF says staff will take it. */
export function geoTagReminderLine(mode: string | null): string {
  if (mode === "SELF") return "क्या आपने संपदा 2.0 ऐप से संपत्ति की जियो-टैग फ़ोटो ले ली है? न ली हो तो ऑफिस से संपर्क करें।";
  if (mode === "STAFF") return "जियो-टैग फ़ोटो के लिए ऑफिस स्टाफ संपर्क करेगा।";
  return "कोई सवाल हो तो ऑफिस से संपर्क करें।";
}

export function registryReminderText(ref: string, date: string, time: string | null, mode: string | null): string {
  return [
    "नमस्ते, नागरिक सेवा केंद्र से याद दिलाना:",
    `अनुरोध नंबर ${ref} की रजिस्ट्री कल ${registryWhenHi(date, time)} को है।`,
    ID_REMINDER,
    geoTagReminderLine(mode),
    "धन्यवाद।",
  ].join("\n");
}
