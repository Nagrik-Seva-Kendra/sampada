/**
 * Pure helpers for the WhatsApp front door (wa-smart.spec.ts): the menu,
 * gibberish / abuse detection, what may be sent to the model, and the cost
 * estimate text. No Nest/Prisma imports.
 */
import { officeFeeFor, type WaFeeKind, type WaOfficeFees } from "@sampada/shared";
import { inr, normDigits } from "./intake-rules.js";

// ---------- menu ----------
export const MENU_TEXT =
  "नमस्ते! नागरिक सेवा केंद्र में आपका स्वागत है। कृपया नंबर लिखें:\n" +
  "1. नई रजिस्ट्री / बंधक का ड्राफ्ट\n" +
  "2. रजिस्ट्री खर्च जानना / गाइडलाइन पता करना\n" +
  "3. मेरा काम कहाँ पहुँचा (अनुरोध नंबर)\n" +
  "4. स्टाफ से बात";

export const MENU_CALL_LINE = "5. ऑफिस को कॉल / कॉल बैक";
/** The menu; option 5 (call) only when OFFICE_CALL_NUMBER is set. */
export const menuText = (callOn: boolean) => (callOn ? `${MENU_TEXT}\n${MENU_CALL_LINE}` : MENU_TEXT);

export type MenuChoice = 1 | 2 | 3 | 4 | 5;

/** "1"/"१"/"1." or the words of an option → its number; null otherwise. With `callOn`, "5" and call words → 5. */
export function parseMenuChoice(text: string, callOn = false): MenuChoice | null {
  const s = normDigits(text).trim().toLowerCase();
  const n = s.match(callOn ? /^([1-5])(?:\s*[.)।]?\s*)$/ : /^([1-4])(?:\s*[.)।]?\s*)$/);
  if (n) return Number(n[1]) as MenuChoice;
  if (callOn && /कॉल|call|फ़ोन|फोन|phone|बात करवा/.test(s)) return 5;
  if (/खर्च|खर्चा|kharch|kharcha|गाइडलाइन|guideline|स्टाम्प|stamp|फीस|fees?\b|शुल्क|कितना लगेगा|kitna lagega|cost/.test(s)) return 2;
  if (/कहाँ पहुँचा|कहां पहुंचा|kahan pahuncha|स्थिति|status|मेरा काम|mera kaam|अनुरोध नंबर|request (no|number)/.test(s)) return 3;
  if (/स्टाफ|staff|बात करनी|बात करना|baat karni|baat karna|call|कॉल|फोन करें|phone karo|इंसान|human/.test(s)) return 4;
  if (/नई रजिस्ट्री|ड्राफ्ट|draft|nayi registry|new registry|बंधक का ड्राफ्ट/.test(s)) return 1;
  return null;
}

const GREETING = /^(hi+|hello+|hey+|helo|hlo|namaste|namaskar|नमस्ते|नमस्कार|प्रणाम|राम राम|ram ram|jai shri ram|जय श्री राम|good (morning|evening|afternoon)|gm|सुप्रभात|menu|मेनू|help|मदद|start|शुरू|हाय|हेलो|हैलो)[\s!.,।]*$/i;
export const isGreeting = (text: string) => GREETING.test(text.trim());

// ---------- gibberish ----------
// Keyboard mash like "Jdjdhd", "Dbhdhd", "sdfsdf": Latin words with (almost)
// no vowels, or a 2-3 letter chunk repeated. Devanagari, digits, real words
// and short replies ("ok", "hm") are never gibberish.
const KNOWN_LATIN = /^(ok|okay|hmm+|hm|ji|haan|han|ha|na|nahi|nahin|no|yes|thx|thanks|pls|plz|dr|mr|mrs|smt|shri|sri|gm|gn|tq|ty)$/i;

function wordIsGibberish(w: string): boolean {
  const s = w.toLowerCase();
  if (s.length < 4 || KNOWN_LATIN.test(s)) return false;
  const vowels = (s.match(/[aeiouy]/g) ?? []).length;
  if (vowels / s.length < 0.2) return true;
  if (/^(.{2,3})\1{1,}/.test(s)) return true; // "asas", "sdfsdf"
  return /[bcdfghjklmnpqrstvwxz]{5,}/.test(s);
}

export function isGibberish(text: string): boolean {
  const t = text.trim();
  if (!t || /[ऀ-ॿ]/.test(t) || /\d/.test(t)) return false;
  const words = t.split(/[\s,.;:!?।]+/).filter(Boolean);
  const latin = words.filter((w) => /^[a-z]+$/i.test(w));
  if (!latin.length || latin.length !== words.length) return false;
  return latin.some(wordIsGibberish) && latin.every((w) => wordIsGibberish(w) || w.length < 3);
}

// ---------- abuse ----------
// Common Hindi/Hinglish/English abuse (whole words only, so names are safe).
const ABUSE = [
  "madarchod", "maderchod", "bhenchod", "behenchod", "chutiya", "chutiye", "gandu", "harami", "haramkhor",
  "randi", "bhosdike", "bhosdi", "lavde", "lawde", "lauda", "kutte", "kamina", "kamine", "fuck", "fucker", "motherfucker", "bitch", "bastard",
  "मादरचोद", "भेनचोद", "बहनचोद", "चूतिया", "चुतिया", "गांडू", "हरामी", "हरामखोर", "रंडी", "भोसडी", "भोसड़ी", "लौड़ा", "लवडे", "कुत्ते", "कमीने", "कमीना",
];
export function isAbusive(text: string): boolean {
  const words = text.toLowerCase().normalize("NFC").split(/[^a-zऀ-ॿ]+/).filter(Boolean);
  return words.some((w) => ABUSE.includes(w));
}

// ---------- what may reach the model ----------
/**
 * Customer text for the intent model: Aadhaar/PAN/phone numbers and e-mail
 * addresses are removed (any 6+ digit run, PAN pattern, e-mail). Never send
 * an Aadhaar/PAN step's answer at all -- callers only use this for choice steps.
 */
export function redactForModel(text: string): string {
  return normDigits(text)
    .replace(/[A-Z]{5}\s?\d{4}\s?[A-Z]/gi, "[ID]")
    .replace(/\S+@\S+\.\S+/g, "[EMAIL]")
    .replace(/\d[\d\s-]{4,}\d/g, (m) => (m.replace(/\D/g, "").length >= 6 ? "[NUMBER]" : m))
    .slice(0, 500);
}

// ---------- cost estimate (menu 2) ----------
export const COST_KIND_ASK =
  "खर्च का अनुमान — कौन सा दस्तावेज़? नंबर लिखें:\n" +
  "1. रजिस्ट्री (विक्रय पत्र)\n" +
  "2. GDA पट्टा\n" +
  "3. कोई और दस्तावेज़ (दान, बंधक, मुख्तारनामा, अनुबंध आदि)";
export const COST_AMOUNT_ASK =
  "रजिस्ट्री किस राशि पर होगी? राशि लिखें (जैसे 15 लाख)।\n" +
  "गाइडलाइन मूल्य भी जानना हो तो संपत्ति की पुरानी रजिस्ट्री की PDF या फ़ोटो भेजें।";

// ---------- amounts in free text (cost flow) ----------
const MONEY_UNIT = "करोड़|करोड|crores?|cr|लाख|lakhs?|lacs?|हज़ार|हजार|ha[zj]{1,2}a{1,2}r|thousand|k";
const MONEY_TOKEN = new RegExp(`(\\d+(?:\\.\\d+)?)(?:\\s*(${MONEY_UNIT})(?![a-z\\u0900-\\u097F]))?`, "g");
const unitValue = (u: string | undefined): number =>
  !u ? 1 : /करोड|cr/.test(u) ? 1e7 : /लाख|lakh|lac/.test(u) ? 1e5 : 1e3;
/** Numbers that are not money: an area right after, or a label (ward, plot, survey ...) right before. */
const AREA_AFTER = /^\s*(sq\.?\s*(ft|feet|m|mt|mtr|meter|metre|yd|yard)|sqft|sqm|square|वर्ग|फुट|फ़ुट|फीट|feet|ft\b|गज|gaj|बीघा|bigha|हेक्टेयर|hectare|एकड़|acre)/i;
const LABEL_BEFORE = /(ward|वार्ड|survey|सर्वे|plot|प्लॉट|प्लाट|khasra|खसरा|house|मकान|flat|फ्लैट|no\.?|नंबर|number|नं\.?|क्रमांक)\s*[:.#-]?\s*$/i;

/**
 * The amount in a customer's text: "33,47,000/-", "₹33,47,000", "3347000",
 * "33 lakh 47 hajaar", "33 लाख 47 हज़ार", "33.47 lakh", also inside a
 * sentence. Ward / plot / survey numbers and areas ("2770 sqft") are skipped;
 * a bare number must be at least 10,000 (and not a 10-digit phone number).
 */
export function parseMoney(text: string): number | null {
  const s = normDigits(text).toLowerCase().replace(/(\d),(?=\d)/g, "$1");
  const tokens = [...s.matchAll(MONEY_TOKEN)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, n: parseFloat(m[1]!), raw: m[1]!, mult: unitValue(m[2]) }));
  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i]!;
    let value = first.n * first.mult;
    let end = first.end;
    // "33 lakh 47 hajaar", "1 करोड़ 20 लाख": bigger unit, then smaller ones.
    let j = i;
    while (first.mult > 1 && j + 1 < tokens.length) {
      const next = tokens[j + 1]!;
      const gap = s.slice(tokens[j]!.end, next.start);
      if (next.mult > 1 && next.mult < tokens[j]!.mult && /^\s*(,|और|aur|or|\+)?\s*$/.test(gap)) {
        value += next.n * next.mult;
        end = next.end;
        j++;
      } else break;
    }
    const before = s.slice(0, first.start);
    const after = s.slice(end);
    i = j;
    if (LABEL_BEFORE.test(before) || AREA_AFTER.test(after)) continue;
    if (first.mult === 1 && (value < 10_000 || first.raw.replace(/\D/g, "").length >= 10)) continue;
    value = Math.round(value);
    if (value >= 1000) return value;
  }
  return null;
}

/** The customer also asks for the guideline (colony / ward / area / rate). */
export const asksGuideline = (text: string): boolean =>
  /guide\s*line|गाइड\s*लाइन|\brate\b|रेट|sq\.?\s*ft|sqft|वर्ग\s*फ़?ुट|ward|वार्ड|colony|कॉलोनी|कालोनी/i.test(normDigits(text));

export const COST_AMOUNT_UNCLEAR =
  "राशि समझ नहीं आई, कृपया जैसे 33,47,000 या 33 लाख 47 हज़ार लिखें।\n" +
  "गाइडलाइन मूल्य जानना हो तो संपत्ति की पुरानी रजिस्ट्री की PDF या फ़ोटो भेजें।";

export function parseCostKind(text: string): WaFeeKind | null {
  const s = normDigits(text).trim().toLowerCase();
  if (/^1\b|रजिस्ट्री|विक्रय|registry|sale|बैनामा/.test(s)) return "registry";
  if (/^2\b|पट्टा|patta|gda|जीडीए/.test(s)) return "gdaPatta";
  if (/^3\b|दान|बंधक|मुख्तार|अनुबंध|other|और|अन्य|वसीयत|gift|mortgage|\bdaa?n\b|bandhak|mukhtar|anubandh|agreement|vasiyat|wasiyat|will\b/.test(s)) return "other";
  return null;
}

const feeLine = (fee: number | null) =>
  fee == null ? "कार्यालय शुल्क: कार्यालय बताएगा" : `कार्यालय शुल्क: ₹${inr(fee)} (लेखन शुल्क सहित, कुल)`;

/** GDA पट्टा / other documents: only the office fee is fixed. */
export function flatFeeText(kind: "gdaPatta" | "other", cfg: WaOfficeFees): string {
  const label = kind === "gdaPatta" ? "GDA पट्टा" : "यह दस्तावेज़";
  return [
    `${label} — ${feeLine(officeFeeFor(kind, null, cfg))}`,
    "स्टाम्प शुल्क और पंजीयन शुल्क दस्तावेज़ पर निर्भर हैं — स्टाफ बताएगा।",
    'नया ड्राफ्ट बनवाना हो तो "1" लिखें।',
  ].join("\n");
}

/**
 * Registry estimate. With the guideline value (from a registry) the stamp
 * duty is exact for that area; with only an amount, urban (नगर निगम 9.5%) and
 * other areas (6.5%) are both shown. Fee slab: higher of amount and guideline.
 */
export function registryCostText(
  input: { amount: number | null; guideline: { value: number; sdPct: number } | null },
  cfg: WaOfficeFees,
): string {
  const base = Math.max(input.amount ?? 0, input.guideline?.value ?? 0);
  const lines = ["📋 रजिस्ट्री खर्च का अनुमान"];
  if (input.guideline) lines.push(`गाइडलाइन मूल्य: ₹${inr(input.guideline.value)}`);
  if (input.amount) lines.push(`रजिस्ट्री राशि: ₹${inr(input.amount)}`);
  lines.push(`गणना ₹${inr(base)} पर (जो ज़्यादा हो):`);
  if (input.guideline) {
    lines.push(`स्टाम्प शुल्क (${(input.guideline.sdPct * 100).toFixed(1)}%): ₹${inr(Math.round(base * input.guideline.sdPct))}`);
  } else {
    lines.push(
      `स्टाम्प शुल्क: नगर निगम क्षेत्र 9.5% = ₹${inr(Math.round(base * 0.095))}, अन्य क्षेत्र 6.5% = ₹${inr(Math.round(base * 0.065))}`,
    );
  }
  lines.push(`पंजीयन शुल्क: पुरुष क्रेता 3% = ₹${inr(Math.round(base * 0.03))}, महिला क्रेता 1% = ₹${inr(Math.round(base * 0.01))}`);
  lines.push(feeLine(officeFeeFor("registry", base, cfg)));
  lines.push("", "यह अनुमान है; अंतिम गणना संपदा पोर्टल पर होगी।", 'नया ड्राफ्ट बनवाना हो तो "1" लिखें।');
  return lines.join("\n");
}
