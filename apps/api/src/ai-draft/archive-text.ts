/**
 * Pure helpers over the office's own deed archive (DeedTemplate.content):
 * property type + place read from the text (for retrieval), and masking of the
 * old customers' personal data before any of it reaches the model.
 */

export type AiPropertyType = "plot" | "building" | "agricultural" | "flat";
export const AI_PROPERTY_TYPES: AiPropertyType[] = ["plot", "building", "agricultural", "flat"];

const DEV = "०१२३४५६७८९";
const digits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));

/** The request's property type (from the registry read) → retrieval category; null = not supported. */
export function aiPropertyTypeOf(extractType: string | null | undefined): AiPropertyType | null {
  switch (extractType) {
    case "agricultural":
      return "agricultural";
    case "residential_plot":
      return "plot";
    case "house":
    case "commercial":
      return "building";
    case "flat":
      return "flat";
    default:
      return null;
  }
}

/**
 * Property type of an archive deed from its words. Flat is separate from
 * building; agricultural wins over plot ("सर्वे क्रमांक ... कृषि भूमि").
 * null when the text gives no clear signal (such deeds are never used).
 */
export function classifyPropertyType(content: string): AiPropertyType | null {
  // Boundaries name the neighbours' houses / roads: not this property.
  const s = withoutBoundaries(content);
  if (/फ्लैट|फ़्लैट|flat\s*no|अपार्टमेंट|apartment|फ्लोर पर स्थित/i.test(s)) return "flat";
  if (/कृषि\s*भूमि|सर्वे\s*(क्रमांक|नं)|खसरा\s*(क्रमांक|नं)[^।\n]{0,80}हेक्टेयर|हेक्टेयर|सिंचित|असिंचित/.test(s)) return "agricultural";
  if (/मकान|भवन|निर्मित|निर्माण\s*सहित|दुकान|कमरे|पक्का\s*मकान|आर\.?\s*सी\.?\s*सी/.test(s)) return "building";
  if (/प्ला(ट|ॅट)\s*(क्रमांक|नं)|भूखण्ड|भूखंड|प्लाट/.test(s)) return "plot";
  return null;
}

/** The text without the चतुःसीमा part (boundary lines). */
export function withoutBoundaries(content: string): string {
  return content
    .split("\n")
    .filter((l) => !/^\s*(पूर्व|पश्चिम|उत्तर|दक्षिण)\s*(में|दिशा में)?\s*[-:]/.test(l))
    .join("\n");
}

export interface PlaceText {
  colony: string | null;
  village: string | null;
  ward: string | null;
  tehsil: string | null;
  district: string | null;
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").replace(/[,।.()]+$/g, "").replace(/\s+/g, " ").trim();
  return t && t.length <= 60 ? t : null;
};
/** "ग्राम X", "वार्ड क्रमांक 12", "तहसील X", "जिला X", "X कॉलोनी" -- first occurrence of each. */
export function placeOf(content: string): PlaceText {
  const s = digits(content);
  const word = "([\\u0900-\\u097F]+(?:\\s[\\u0900-\\u097F]+){0,2})";
  const village = s.match(new RegExp(`ग्राम\\s*[-:]?\\s*${word}`))?.[1];
  const ward = s.match(/वार्ड\s*(?:क्रमांक|क्र\.?|नं\.?|नंबर)?\s*[-:]?\s*(\d{1,3})/)?.[1];
  const tehsil = s.match(new RegExp(`तहसील\\s*[-:]?\\s*([\\u0900-\\u097F]+)`))?.[1];
  const district = s.match(new RegExp(`(?:जिला|जिले|ज़िला)\\s*[-:]?\\s*([\\u0900-\\u097F]+)`))?.[1];
  const colony = s.match(new RegExp(`${word}\\s*(?:कॉलोनी|कालोनी|नगर|विहार|एन्क्लेव|सिटी|city|colony)`, "i"))?.[0];
  return {
    colony: clean(colony),
    village: clean(village?.split(/\s(?:तहसील|जिला|परगना|वार्ड)/)[0]),
    ward: ward ?? null,
    tehsil: clean(tehsil),
    district: clean(district),
  };
}

const norm = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "").replace(/[़]/g, "");
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && norm(a) === norm(b);

/**
 * Location score of an archive deed for the new property: same colony/village
 * + ward 4, same colony/village or ward 3, tehsil 2, district 1, else 0.
 * Starred ("आदर्श") deeds get +0.5. With the reason in Hindi for the transparency list.
 */
export function locationScore(target: PlaceText, cand: PlaceText & { starred?: boolean }): { score: number; reason: string } {
  const place = same(target.colony, cand.colony) || same(target.village, cand.village);
  const ward = same(target.ward, cand.ward);
  let score = 0;
  let reason = "केवल प्रकार समान";
  if (place && ward) [score, reason] = [4, "वही कॉलोनी/ग्राम और वार्ड"];
  else if (place) [score, reason] = [3, "वही कॉलोनी/ग्राम"];
  else if (ward) [score, reason] = [3, "वही वार्ड"];
  else if (same(target.tehsil, cand.tehsil)) [score, reason] = [2, "वही तहसील"];
  else if (same(target.district, cand.district)) [score, reason] = [1, "वही जिला"];
  if (cand.starred) {
    score += 0.5;
    reason += " · आदर्श डीड ★";
  }
  return { score, reason };
}

export interface Candidate extends PlaceText {
  deedId: string;
  title: string;
  starred: boolean;
  updatedAt: Date;
}

/** Top `n` archive deeds by location score, then most recent. */
export function pickExamples(target: PlaceText, cands: Candidate[], n = 3): (Candidate & { score: number; reason: string })[] {
  return cands
    .map((c) => ({ ...c, ...locationScore(target, c) }))
    .sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, n);
}

// ---------- masking ----------
export interface Masked {
  text: string;
  /** The values replaced (names, numbers ...) -- used only for the leak check, never logged or stored. */
  originals: string[];
}

// A name word: Devanagari, but never a relation word / honorific / "निवासी" (those end the name).
const STOP = "(?:पुत्री|पुत्र|पत्नी|पति|श्रीमती|सुश्री|श्री|निवासी|उम्र|आयु|जाति|पता|व्यवसाय|का|की|के)";
const NAME_WORD = `(?!${STOP}(?=[\\s,।)(]|$))[\\u0900-\\u097F]{2,}`;
const NAME_WORDS = `${NAME_WORD}(?:\\s${NAME_WORD}){0,3}`;
const HONORIFIC = "(?:श्रीमती|सुश्री|कुमारी|श्री|स्व\\.?|स्वर्गीय|मेसर्स|मै\\.)";

/**
 * Old customers' data out of an archive deed: names after an honorific,
 * Aadhaar / PAN / mobile / e-mail, amounts, addresses after "निवासी", khasra /
 * plot numbers and boundary neighbours. Structure and standard wording stay.
 */
export function maskArchive(content: string): Masked {
  const originals: string[] = [];
  let n = 0;
  const keep = (v: string) => {
    const t = v.trim();
    if (t.length >= 3) originals.push(t);
  };
  let s = content;
  s = s.replace(/(?<![\d०-९])[2-9२-९][\d०-९]{3}[\s-]?[\d०-९]{4}[\s-]?[\d०-९]{4}(?![\d०-९])/g, (m) => (keep(m), "[आधार]"));
  s = s.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, (m) => (keep(m), "[PAN]"));
  s = s.replace(/(?<![\d०-९])(?:\+?91[\s-]?)?[6-9६-९][\d०-९]{9}(?![\d०-९])/g, (m) => (keep(m), "[मोबाइल]"));
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => (keep(m), "[ईमेल]"));
  s = s.replace(new RegExp(`(${HONORIFIC})\\s*(${NAME_WORDS})`, "g"), (_m, h: string, name: string) => {
    keep(name);
    n++;
    return `${h} [नाम-${n}]`;
  });
  // Addresses and boundaries are masked but not leak-checked: they share common place words with the new deed.
  s = s.replace(/(निवासी|नि\.|पता)\s*[-:]?\s*([^,।\n)]{3,80})/g, (_m, k: string) => `${k} [पता]`);
  s = s.replace(/((?:रु\.?|रू\.?|रुपये|रूपये|₹)\s*)([\d०-९][\d०-९,./-]*)/g, (_m, k: string, v: string) => (keep(v), `${k}[राशि]`));
  s = s.replace(/((?:खसरा|सर्वे|प्ला(?:ट|ॅट)|भूखण्ड|मकान)\s*(?:क्रमांक|नं\.?|नंबर)\s*[-:]?\s*)([\d०-९][\d०-९/,\sA-Za-z-]{0,30})/g, (_m, k: string, v: string) => (keep(v), `${k}[क्रमांक]`));
  s = s.replace(/((?:पूर्व|पश्चिम|उत्तर|दक्षिण)\s*(?:में|दिशा में)?\s*[-:]\s*)([^\n।]{2,80})/g, (_m, k: string) => `${k}[सीमा]`);
  return { text: s, originals: [...new Set(originals)] };
}

/**
 * Old-customer values that appear in the generated draft but are not part of
 * the new request's own facts. Returns the count only (values never leave).
 */
export function leakCount(output: string, originals: string[], allowed: string[]): number {
  const out = digits(output).replace(/\s+/g, " ");
  const ok = allowed.map((a) => digits(a).replace(/\s+/g, " ").trim()).filter(Boolean);
  let n = 0;
  for (const o of originals) {
    const v = digits(o).replace(/\s+/g, " ").trim();
    if (v.length < 4 || /^[\d,./-]+$/.test(v) && v.replace(/\D/g, "").length < 5) continue; // short numbers ("12", "1/2") are not identifying
    if (ok.some((a) => a.includes(v) || v.includes(a))) continue;
    if (out.includes(v)) n++;
  }
  return n;
}
