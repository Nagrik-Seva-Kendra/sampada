import { placeOf, withoutBoundaries } from "../ai-draft/archive-text.js";

/**
 * Pure rules for the archive risk check: what an archive deed says about a
 * property (number, place, sellers, buyers) and the warnings for a new deed of
 * the same property -- sold before by the same seller, broken chain, mortgage
 * without a re-conveyance.
 */

const DEV = "०१२३४५६७८९";
const digits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));

/** "47", "47/2", "१२३/४" → "47", "47/2", "123/4"; letters kept upper-case ("12A"). */
export function normNumber(v: string | null | undefined): string | null {
  const s = digits(v ?? "").toUpperCase().replace(/\s+/g, "").replace(/[^\dA-Z/]/g, "");
  return /\d/.test(s) ? s : null;
}

/** Name for comparison: no honorific, no nukta / chandrabindu differences, no spaces. */
export function normName(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/^(श्री|श्रीमती|सुश्री|कुमारी|स्व\.?|स्वर्गीय|मेसर्स|मै\.)\s*/u, "")
    .replace(/[़ँ]/g, "")
    .replace(/ं/g, "न")
    .replace(/्/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function normPlace(v: string | null | undefined): string {
  return (v ?? "").replace(/[़]/g, "").replace(/(कॉलोनी|कालोनी|colony)/gi, "").replace(/\s+/g, "").trim();
}

export interface PropertyFacts {
  number: string | null;
  colony: string | null;
  village: string | null;
  ward: string | null;
  tehsil: string | null;
  district: string | null;
  sellers: string[];
  buyers: string[];
}

const NAME = "([\\u0900-\\u097F]{2,}(?:\\s[\\u0900-\\u097F]{2,}){0,3})";
const STOP = /\s(?:पुत्र|पुत्री|पत्नी|पति|उम्र|आयु|निवासी|नि\.|जाति|व्यवसाय|पता|द्वारा)(?:\s|$)/;

/** Names after an honorific in one party block. */
function namesIn(block: string): string[] {
  const out: string[] = [];
  for (const m of block.matchAll(new RegExp(`(?:श्रीमती|सुश्री|कुमारी|श्री|मेसर्स)\\s*${NAME}`, "g"))) {
    const name = m[1]!.split(STOP)[0]!.trim();
    // A name followed by "पुत्र/पत्नी श्री Y": Y is a parent, not a party -- skip names right after a relation word.
    const before = block.slice(Math.max(0, m.index! - 8), m.index!);
    if (/(पुत्र|पुत्री|पत्नी|पति)\s*$/.test(before)) continue;
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The party block after a heading ("विक्रेता पक्ष -", "क्रेता पक्ष -", "बंधककर्ता") up to a blank line. */
function block(content: string, heading: RegExp): string {
  const lines = content.replace(/\r/g, "").split("\n");
  const i = lines.findIndex((l) => heading.test(l));
  if (i < 0) return "";
  const out: string[] = [];
  for (let k = i; k < lines.length && (k === i || lines[k]!.trim()); k++) out.push(lines[k]!);
  return out.join("\n");
}

/** What an archive deed says about its property and parties. */
export function factsOf(content: string): PropertyFacts {
  const body = withoutBoundaries(content);
  const s = digits(body);
  const num =
    s.match(/(?:प्ला(?:ट|ॅट)|भूखण्ड|भूखंड|मकान)\s*(?:क्रमांक|क्र\.?|नं\.?|नंबर)\s*[-:]?\s*([\dA-Za-z/]+)/)?.[1] ??
    s.match(/(?:सर्वे|खसरा)\s*(?:क्रमांक|क्र\.?|नं\.?|नंबर)\s*[-:]?\s*([\d/]+)/)?.[1] ??
    null;
  const place = placeOf(body);
  return {
    number: normNumber(num),
    ...place,
    sellers: namesIn(block(body, /^\s*(विक्रेता|बंधककर्ता|पट्टाकर्ता|दानकर्ता)/)),
    buyers: namesIn(block(body, /^\s*(क्रेता|बंधकग्रहीता|पट्टेदार|दानग्रहीता)/)),
  };
}

/** Same property: same number, and same village or colony; ward must agree when both have one. */
export function sameProperty(a: Pick<PropertyFacts, "number" | "colony" | "village" | "ward">, b: Pick<PropertyFacts, "number" | "colony" | "village" | "ward">): boolean {
  if (!a.number || a.number !== b.number) return false;
  const place = (a.village && b.village && normPlace(a.village) === normPlace(b.village)) || (a.colony && b.colony && normPlace(a.colony) === normPlace(b.colony));
  if (!place) return false;
  return !(a.ward && b.ward && a.ward !== b.ward);
}

const sameName = (x: string, y: string) => {
  const a = normName(x);
  const b = normName(y);
  return !!a && !!b && (a === b || (a.length >= 6 && b.length >= 6 && (a.startsWith(b) || b.startsWith(a))));
};
const anyMatch = (xs: string[], ys: string[]) => xs.some((x) => ys.some((y) => sameName(x, y)));

export interface ArchiveDeedFacts extends PropertyFacts {
  deedId: string;
  deedType: string;
  title: string;
  date: Date;
}

export interface RiskWarning {
  code: "doubleSale" | "chain" | "mortgage";
  /** Hindi, for staff; names only from the office's own records. */
  message: string;
  deedId: string;
  deedTitle: string;
  date: string;
}

const dmy = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

/**
 * Warnings for a new deed of `target` sold by `sellers`, against the archive
 * deeds of the same property (oldest first).
 */
export function riskWarnings(target: Pick<PropertyFacts, "number" | "colony" | "village" | "ward">, sellers: string[], archive: ArchiveDeedFacts[], excludeDeedId?: string): RiskWarning[] {
  const same = archive.filter((d) => d.deedId !== excludeDeedId && sameProperty(target, d)).sort((a, b) => a.date.getTime() - b.date.getTime());
  const out: RiskWarning[] = [];
  const w = (code: RiskWarning["code"], d: ArchiveDeedFacts, message: string) => out.push({ code, message, deedId: d.deedId, deedTitle: d.title, date: dmy(d.date) });
  const sales = same.filter((d) => d.deedType === "sale-deed");
  for (const d of sales) {
    if (sellers.length && anyMatch(d.sellers, sellers)) {
      w("doubleSale", d, `यही संपत्ति इन्हीं विक्रेता (${d.sellers.join(", ")}) द्वारा पहले भी बेची जा चुकी है — दोहरी बिक्री की आशंका।`);
    }
  }
  const last = sales.at(-1);
  if (last && sellers.length && last.buyers.length && !anyMatch(last.buyers, sellers)) {
    w("chain", last, `श्रृंखला मेल नहीं खाती: ऑफिस की पिछली रजिस्ट्री में खरीदार ${last.buyers.join(", ")} थे, अब विक्रेता ${sellers.join(", ")} हैं — बीच की रजिस्ट्री/नामांतरण जाँचें।`);
  }
  const mortgages = same.filter((d) => d.deedType === "equitable-mortgage-deed");
  for (const m of mortgages) {
    const released = same.some((d) => d.deedType === "reconveyance-deed" && d.date >= m.date);
    if (!released) w("mortgage", m, "इस संपत्ति पर बंधक दर्ज है और उसके बाद री-कन्वेयन्स (बंधक मुक्ति) ऑफिस के रिकॉर्ड में नहीं मिला — बैंक से NOC जाँचें।");
  }
  return out;
}
