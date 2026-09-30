/**
 * Pure helpers for the WhatsApp draft-intake flow: validators, amount parsing,
 * and income-tax threshold notices. No Nest/Prisma imports so they are unit-tested
 * in isolation (intake-rules.spec.ts).
 */

// ---------- digits / format ----------
export const normDigits = (s: string): string =>
  s.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));

export const inr = (n: number): string => n.toLocaleString("en-IN");

// ---------- Aadhaar (Verhoeff checksum) ----------
const VD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(num: string): boolean {
  let c = 0;
  num.split("").reverse().map(Number).forEach((d, i) => {
    c = VD[c]![VP[i % 8]![d]!]!;
  });
  return c === 0;
}

export const validAadhaar = (v: string): string | null => {
  const d = normDigits(v).replace(/\D/g, "");
  return /^[2-9]\d{11}$/.test(d) && verhoeffValid(d) ? d : null;
};
export const validPan = (v: string): string | null => {
  const p = v.toUpperCase().replace(/\s/g, "");
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(p) ? p : null;
};
export const validMobile = (v: string): string | null => {
  let d = normDigits(v).replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};
export const validEmail = (v: string): string | null => {
  const e = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};
export const validText =
  (min = 3) =>
  (v: string): string | null =>
    v.trim().length >= min ? v.trim().replace(/\s+/g, " ") : null;

// ---------- amount ----------
export function parseAmount(v: string): number | null {
  const s = normDigits(v).replace(/,/g, "").toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(करोड़|करोड|crore|cr|लाख|lakh|lac|हजार|हज़ार|thousand|k)?/);
  if (!m) return null;
  let n = parseFloat(m[1]!);
  const u = m[2] ?? "";
  if (/करोड|crore|cr/.test(u)) n *= 1e7;
  else if (/लाख|lakh|lac/.test(u)) n *= 1e5;
  else if (/हजार|हज़ार|thousand|k/.test(u)) n *= 1e3;
  n = Math.round(n);
  return n >= 1000 ? n : null;
}

// ---------- income-tax thresholds ----------
/**
 * VERIFY against the Income-tax Act, 2025 and Income-tax Rules, 2026 text
 * before go-live. Values as reported for tax year 2026-27.
 */
export const TAX_RULES = {
  PAN_REQUIRED_FROM: 2_000_000, // Rs 20 lakh — value or stamp duty value
  SFT_REPORTING_FROM: 4_500_000, // Rs 45 lakh — reported by the registrar
  TDS_FROM: 5_000_000, // Rs 50 lakh — 1%, s.393(1), Form 141; not for agricultural land
  CASH_ADVANCE_LIMIT: 20_000, // s.185
  CASH_RECEIPT_LIMIT: 200_000, // s.186
} as const;

export interface TaxFlags {
  panRequired: boolean;
  sftReported: boolean;
  tdsApplies: boolean;
}

/** value = higher of declared amount and guideline value (if known). */
export function taxFlags(value: number, agricultural: boolean): TaxFlags {
  return {
    panRequired: value >= TAX_RULES.PAN_REQUIRED_FROM,
    sftReported: value >= TAX_RULES.SFT_REPORTING_FROM,
    tdsApplies: !agricultural && value >= TAX_RULES.TDS_FROM,
  };
}

export function taxNotice(f: TaxFlags): string {
  const lines = ["⚠️ आयकर संबंधी सूचना:"];
  if (f.panRequired) lines.push("• इस राशि पर खरीदार और विक्रेता दोनों का PAN अनिवार्य है।");
  if (f.sftReported) lines.push("• यह सौदा रजिस्ट्रार द्वारा आयकर विभाग को रिपोर्ट किया जाएगा।");
  if (f.tdsApplies)
    lines.push("• खरीदार को भुगतान से पहले 1% TDS काटकर Form 141 से जमा करना होगा।");
  lines.push(
    `• ₹${inr(TAX_RULES.CASH_ADVANCE_LIMIT)} या अधिक का बयाना/एडवांस, या ₹${inr(
      TAX_RULES.CASH_RECEIPT_LIMIT,
    )} या अधिक भुगतान नकद न करें — बैंक/UPI/चेक से ही करें।`,
    "",
    "सौदे की राशि अपनी आय और ITR में सही दर्शाना आपकी स्वयं की ज़िम्मेदारी है। इससे जुड़े किसी भी आयकर नोटिस, जुर्माने या कर के लिए नागरिक सेवा केंद्र (दस्तावेज़ लेखक) ज़िम्मेदार नहीं होगा। टैक्स सलाह के लिए अपने CA से संपर्क करें।",
  );
  return lines.join("\n");
}

// ---------- what the customer wants made ----------
export type DeedIntent = "sale" | "mortgage" | "other";

/**
 * Reads the kind of deed from the customer's own words (Hindi/English/Hinglish).
 * Mortgage is checked first: "बैंक का सैंक्शन लेटर है बंधक बनाना है" must not
 * fall through to anything else. Returns null when nothing is recognisable.
 */
export function detectDeedIntent(text: string): DeedIntent | null {
  const s = normDigits(text).toLowerCase();
  if (/बंधक|गिरवी|रहन|रेहन|mortgage|bandhak|girvi|सैंक्शन|सेंक्शन|sanction|होम लोन|बैंक लोन|लोन|loan/.test(s)) return "mortgage";
  if (/दान|गिफ्ट|gift|वसीयत|\bwill\b|बंटवारा|बँटवारा|partition|मुख्तार|पावर|power of attorney|\bpoa\b|किराया|लीज़|लीज|lease|रिलीज|release|हक ?त्याग|अनुबंध|इकरार|agreement|संशोधन|amendment/.test(s))
    return "other";
  if (/विक्रय|बेचना|बेचनी|बेचने|बेच|खरीद|बैनामा|sale|becha|kharid|रजिस्ट्री|registry/.test(s)) return "sale";
  return null;
}

/** Answer to "which document?": 1/2/3 or words. */
export function parseDeedChoice(text: string): DeedIntent | null {
  const s = normDigits(text).trim();
  if (/^1\b/.test(s)) return "sale";
  if (/^2\b/.test(s)) return "mortgage";
  if (/^3\b/.test(s)) return "other";
  return detectDeedIntent(s);
}

/**
 * People on a बंधक पत्र, in question order. `prefix` names the answers in
 * DraftIntake.data (e.g. mortgagorName, witness1Aadhaar).
 */
export const MORTGAGE_PEOPLE = [
  { prefix: "mortgagor", heading: "बंधककर्ता", who: "बंधककर्ता (जो संपत्ति बंधक रख रहे हैं)" },
  { prefix: "witness1", heading: "पहला गवाह", who: "पहले गवाह" },
  { prefix: "witness2", heading: "दूसरा गवाह", who: "दूसरे गवाह" },
] as const;
