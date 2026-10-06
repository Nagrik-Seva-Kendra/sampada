import {
  type ColonyGuidelineRow,
  type ColonyPartner,
  type ColonyProjectKind,
  type ColonySetupSuggestion,
  type ColonySource,
  type ColonySourced,
  COLONY_MARKERS,
} from "@sampada/shared";
import { flatValue, GUIDELINE_DATA, type GuidelineEntry, plotAreaToSqm, plotValue } from "../whatsapp/guideline/calculator.js";

/**
 * Pure rules for "Setup from the old deeds": what an old sale deed of a colony /
 * commercial project says (developer, partner pair, development permission and
 * maintenance paragraphs, place, the plot / unit with its block), the merged
 * suggestion across many deeds, the marked standard text, the guideline value
 * from the office calculator, and the checks on a generated deed. No party's
 * Aadhaar / PAN / mobile ever goes into the standard text. Deeds typed in Word
 * carry invisible joiners ("ब्‍लॉक", "इन्‍फ्राटेक"): every rule reads cleaned text.
 */

const DEV = "०१२३४५६७८९";
export const asciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));
/** Zero-width joiners / non-joiners, BOM and NBSP out; CRLF → LF. */
export const cleanText = (s: string) => s.replace(/[​-‍﻿]/g, "").replace(/ /g, " ").replace(/\r/g, "");
const norm = (s: string) => asciiDigits(cleanText(s)).replace(/[़]/g, "").replace(/\s+/g, " ").trim();
const key = (s: string) => norm(s).replace(/[\s,।.:;()-]/g, "").toLowerCase();

// ---------- personal data out ----------
/** Aadhaar, PAN, mobile and e-mail → "____" (the standard text never carries a party's ids). */
export function maskIds(text: string): string {
  return text
    .replace(/(?<![\d०-९])[2-9२-९][\d०-९]{3}[\s-]?[\d०-९]{4}[\s-]?[\d०-९]{4}(?![\d०-९])/g, "____")
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, "____")
    .replace(/(?<![\d०-९])(?:\+?91[\s-]?)?[6-9६-९][\d०-९]{9}(?![\d०-९])/g, "____")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "____");
}

// ---------- recognisers (on cleaned text) ----------
const SELLER_HEAD = /^\s*(विक्रेता|विक्रयकर्ता)\s*(पक्ष|गण)?/;
const BUYER_HEAD = /^\s*(क्रेता|क्रयकर्ता)\s*(पक्ष|गण)?/;
const DEV_RE = /(अनुमति|स्वीकृति|अनुज्ञा|अनुज्ञप्ति|परमिशन|permission|नगर तथा ग्राम निवेश|टी\.?\s*एन\.?\s*सी\.?\s*पी|T\s*&\s*C\s*P|रेरा|RERA|कॉलोनी\s*सेल|विकास\s*अनुमति)/i;
const DEV_REF_RE = /(क्रमांक|क्र\.|नं\.|No\.?|दिनांक)/i;
const MAINT_RE = /(रखरखाव|रख-रखाव|रख रखाव|मेंटेनेंस|मेन्टेनेन्स|मेंटेनेन्स|अनुरक्षण|maintenance)/i;
const PLOT_LINE = /^\s*(ब्लॉक|ब्लाक|block\b|प्ला(ट|ॅट)\s*(क्रमांक|नं|नंबर|क्र)|क्षेत्रफल|रकबा|(दुकान|शॉप|shop|यूनिट|इकाई)\s*(क्रमांक|नं|नंबर|no)?|(भूतल|प्रथम|द्वितीय|तृतीय|चतुर्थ|पंचम)\s*तल|तल\s*[-:]|मंजिल|मंज़िल)/i;
const DIRS = "(पूर्व|पूरब|पश्चिम|पश्चिमी|उत्तर|दक्षिण)";
const BOUNDARY_LINE = new RegExp(`^\\s*${DIRS}\\s*(में|दिशा में|दिशा)?\\s*[-:]`);
const BOUNDARY_HEAD = /चतुःसीमा|चतुर्सीमा|चौहद्दी|चतुरसीमा/;
const AMOUNT = /(\d[\d,]*\s*\/-|(?:रु|रू)\.?\s*\d|रूपये\s*\d|\d[\d,]{4,}\s*(?:रूपये|रुपये))/;
const PAY_WORD = /(बिक्रीधन|बिक्री\s*धन|विक्रय\s*धन|प्रतिफल|विक्रय\s*(?:मूल्य|राशि))/;
const PAY_MODE = /(UTR|चैक|चेक|cheque|आर\.?\s*टी\.?\s*जी\.?\s*एस|RTGS|NEFT|एन\.?\s*ई\.?\s*एफ\.?\s*टी|डी\.?\s*डी\.?|डिमांड\s*ड्राफ्ट|नकद|यू\.?\s*पी\.?\s*आई|UPI|बैंक\s*ड्राफ्ट)/i;
const PAY_END = /लेना\s*देना\s*(कुछ\s*)?शेष\s*नहीं|लेन\s*देन\s*शेष\s*नहीं/;
const SHOP_RE = /(दुकान|शॉप|shop|यूनिट|unit|कार्यालय\s*क्रमांक|ऑफिस\s*क्रमांक)\s*(क्रमांक|नं\.?|नंबर|no\.?)?\s*[-:]?\s*([A-Z]{0,3}\s*-?\s*\d{1,4}[A-Z]?)/i;
const FLOOR_RE = /(भूतल|ग्राउंड\s*फ्लोर|प्रथम\s*तल|द्वितीय\s*तल|तृतीय\s*तल|चतुर्थ\s*तल|पंचम\s*तल|(?:ground|first|second|third|fourth|fifth)\s*floor|लोअर\s*ग्राउंड|अपर\s*ग्राउंड)/i;
const MASTER_DEED = /मास्टर\s*डीड|master\s*deed/i;

const lineIsPayment = (l: string) => (PAY_WORD.test(l) && AMOUNT.test(l)) || (PAY_MODE.test(l) && AMOUNT.test(l)) || PAY_END.test(l);
const hasPlotLines = (p: string) => p.split("\n").some((l) => PLOT_LINE.test(l) || BOUNDARY_LINE.test(l));

type ParaKind = "seller" | "buyer" | "dev" | "maint" | "payment" | "other";
/** One paragraph's role -- the same rule decides what is extracted into a field and what becomes a marker. */
export function paraKind(p: string): ParaKind {
  if (SELLER_HEAD.test(p)) return "seller";
  if (BUYER_HEAD.test(p)) return "buyer";
  if (hasPlotLines(p)) return "other";
  if (MAINT_RE.test(p)) return "maint";
  if (DEV_RE.test(p) && DEV_REF_RE.test(p) && !PAY_WORD.test(p)) return "dev";
  if (p.split("\n").every((l) => !l.trim() || lineIsPayment(l)) || (PAY_WORD.test(p) && AMOUNT.test(p))) return "payment";
  return "other";
}

/** Paragraphs (blank-line separated), cleaned. */
const paragraphs = (content: string) =>
  cleanText(content)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

// ---------- blocks ----------
const HINDI_BLOCK: Record<string, string> = { ए: "A", बी: "B", सी: "C", डी: "D", ई: "E", एफ: "F", जी: "G", एच: "H", एलआईजी: "LIG", एमआईजी: "MIG", एचआईजी: "HIG", ईडब्ल्यूएस: "EWS" };
const BLOCK_TOKEN = "(LIG|MIG|HIG|EWS|[A-Za-z]|एल\\.?\\s*आई\\.?\\s*जी\\.?|एम\\.?\\s*आई\\.?\\s*जी\\.?|एच\\.?\\s*आई\\.?\\s*जी\\.?|ई\\.?\\s*डब्ल्यू\\.?\\s*एस\\.?|एफ|एच|बी|सी|डी|जी|ए|ई)(?![\\u0900-\\u097FA-Za-z])";
/** "ई" / "बी" / "एल.आई.जी." / "e" → "E" / "B" / "LIG" / "E". */
export function normalizeBlock(raw: string): string {
  const s = raw.replace(/[.\s]/g, "");
  return HINDI_BLOCK[s] ?? s.toUpperCase();
}
/** "04" → "4", "12a" → "12A". */
const normPlotNo = (n: string) => n.replace(/^0+(?=\d)/, "").toUpperCase();

/** Block + plot no. of a deed: "प्लाट क्रमांक - E-28" / "बी-04", else the "ब्लॉक - ई" line, else the title ("C-22", "LIG-12"). */
export function blockAndPlot(text: string, title = ""): { block: string; plotNo: string } | null {
  const t = asciiDigits(cleanText(text));
  const pm = t.match(new RegExp(`प्ला(?:ट|ॅट)\\s*(?:क्रमांक|नं\\.?|नंबर|क्र\\.?|न\\.)\\s*[-:]?\\s*(?:${BLOCK_TOKEN}\\s*[-/]?\\s*)?(\\d{1,4}[A-Za-z]?)(?!\\d)`, "i"));
  const titleM = asciiDigits(cleanText(title)).match(new RegExp(`${BLOCK_TOKEN}\\s*[-/]\\s*(\\d{1,4})(?!\\d)`, "i"));
  const plotNo = pm?.[2] ?? titleM?.[2];
  if (!plotNo) return null;
  const line = t.match(new RegExp(`(?:ब्लॉक|ब्लाक|block)\\s*(?:नं\\.?|क्रमांक|क्र\\.?)?\\s*[-:]?\\s*${BLOCK_TOKEN}`, "i"));
  const raw = pm?.[1] ?? line?.[1] ?? titleM?.[1] ?? "";
  return { block: raw ? normalizeBlock(raw) : "", plotNo: normPlotNo(plotNo) };
}

// ---------- seller ----------
/** The block after a heading line, up to a blank line. */
function blockAfter(content: string, head: RegExp): string {
  const lines = cleanText(content).split("\n");
  const i = lines.findIndex((l) => head.test(l));
  if (i < 0) return "";
  const out: string[] = [];
  for (let k = i; k < lines.length && (k === i || lines[k]!.trim()); k++) out.push(lines[k]!);
  return out.join("\n");
}

/** Names after "भागीदार" / "पार्टनर" / "एवं श्री" in the seller block. */
export function partnerNames(seller: string): string[] {
  const out: string[] = [];
  const s = cleanText(seller).split(/\n/).join(" ");
  const NAME = "([\\u0900-\\u097F]{2,}(?:\\s[\\u0900-\\u097F]{2,}){0,2})";
  const STOP = /\s(पुत्र|पुत्री|पत्नी|पति|उम्र|आयु|निवासी|नि\.|जाति|व्यवसाय|पता|द्वारा|एवं|तथा|और|आधार|पैन)(\s|$).*/;
  for (const m of s.matchAll(new RegExp(`(?:भागीदार(?:गण)?|पार्टनर(?:गण)?|एवं|तथा|व)\\s*[:-]?\\s*(?:श्री|श्रीमती)\\s*${NAME}`, "g"))) {
    const name = m[1]!.replace(STOP, "").trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The firm in the seller block, without its PAN: "मैसर्स ग्रीन इन्फ्राटेक (Pan No. …) द्वारा पार्टनर …" → "मैसर्स ग्रीन इन्फ्राटेक". */
export function developerOf(sellerBody: string): string | null {
  const s = cleanText(sellerBody).replace(/\s+/g, " ");
  const m = s.match(/((?:मैसर्स|मेसर्स|मै\.|मे\.|M\/s\.?|मेसर्स\.)\s*.+?)(?=\s+द्वारा|\s+के\s+(?:भागीदार|पार्टनर)|\s+(?:भागीदार|पार्टनर)\s|$)/i);
  if (!m) return null;
  const v = m[1]!
    .replace(/\((?:[^()]*?(?:pan|पैन|PAN)[^()]*)\)/gi, "")
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/[,।\s-]+$/, "")
    .trim();
  return v || null;
}

// ---------- place ----------
/** The village of the property: "ग्राम डोंगरपुर पुतलीघर, तह. …" -- never "नगर तथा ग्राम निवेश …". */
export function villageOf(text: string): string | null {
  const t = cleanText(text);
  for (const m of t.matchAll(/ग्राम\s*[-:]?\s*([ऀ-ॿ]+(?:\s+[ऀ-ॿ]+){0,3})/g)) {
    const before = t.slice(Math.max(0, m.index! - 6), m.index!);
    if (/तथा\s*$/.test(before)) continue;
    const words: string[] = [];
    for (const w of m[1]!.split(/\s+/)) {
      if (/^(तह|तहसील|जिला|जिले|परगना|पटवारी|हल्का|वार्ड|स्थित|की|के|का|में|निवेश|पंचायत|सर्वे|खसरा|म|मप्र)$/.test(w)) break;
      words.push(w);
    }
    if (words.length && !/^निवेश/.test(words[0]!)) return words.join(" ");
  }
  return null;
}

export interface ColonyDeedFacts {
  developer: string | null;
  seller: string;
  partners: string[];
  devPermissions: string[];
  maintenance: string[];
  village: string | null;
  ward: string | null;
  surveyNos: string[];
  kind: ColonyProjectKind;
  plot: {
    block: string;
    plotNo: string;
    ewFt: number | null;
    nsFt: number | null;
    areaSqft: number | null;
    east: string | null;
    west: string | null;
    north: string | null;
    south: string | null;
    corner: boolean;
    floor: string | null;
  } | null;
  /** The deed's own date ("dd/mm/yyyy" from the last "दिनांक"), null when none. */
  date: string | null;
}

const numOf = (s: string | undefined) => {
  const v = Number(asciiDigits(s ?? "").replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const FLOOR_OF_PREFIX: Record<string, string> = { LG: "लोअर ग्राउंड", UG: "अपर ग्राउंड", GF: "भूतल", FF: "प्रथम तल", SF: "द्वितीय तल", TF: "तृतीय तल" };

/** What one old deed says. */
export function colonyDeedFacts(content: string, title = ""): ColonyDeedFacts {
  const text = cleanText(content);
  const ascii = asciiDigits(text);
  const seller = blockAfter(text, SELLER_HEAD);
  const sellerBody = seller.replace(SELLER_HEAD, "").replace(/^\s*[-:–]\s*/, "").trim();
  const paras = paragraphs(text);
  const devPermissions = paras.filter((p) => paraKind(p) === "dev").map((p) => p.slice(0, 3000));
  const maintenance = paras.filter((p) => paraKind(p) === "maint").map((p) => p.slice(0, 3000));

  const ward = ascii.match(/वार्ड\s*(?:क्रमांक|क्र\.?|नं\.?|नंबर)?\s*[-:]?\s*(\d{1,3})/)?.[1] ?? null;
  const surveyNos = [...new Set([...ascii.matchAll(/(?:सर्वे|खसरा)\s*(?:क्रमांक|नं\.?|नंबर|क्र\.?)\s*[-:]?\s*([\d/]+(?:\s*(?:,|एवं|व|और)\s*[\d/]+)*)/g)].flatMap((m) => m[1]!.split(/\s*(?:,|एवं|व|और)\s*/)).filter(Boolean))];

  const shop = ascii.match(SHOP_RE);
  const bp = blockAndPlot(text, title);
  const kind: ColonyProjectKind = shop && !/प्ला(?:ट|ॅट)\s*(?:क्रमांक|नं|नंबर|क्र)/.test(ascii) ? "SHOP" : "PLOT";
  const dims = ascii.match(/([\d.]+)\s*(?:फुट|फीट|ft)\s*[xX×*]\s*([\d.]+)\s*(?:फुट|फीट|ft)/);
  const area = ascii.match(/([\d.,]+)\s*(?:वर्गफुट|वर्ग फुट|वर्गफीट|वर्ग फीट|sq\.?\s*ft)/i);
  const bound = (dir: string) => {
    const m = text.match(new RegExp(`^\\s*(?:${dir})\\s*(?:में|दिशा में|दिशा)?\\s*[-:]\\s*(.+)$`, "m"));
    return m ? m[1]!.replace(/[।]\s*$/, "").trim() : null;
  };
  let plot: ColonyDeedFacts["plot"] = null;
  const unitNo = kind === "SHOP" ? shop![3]!.replace(/\s+/g, "").toUpperCase() : bp?.plotNo;
  if (unitNo) {
    const anchor = kind === "SHOP" ? shop![0]! : (ascii.match(/प्ला(?:ट|ॅट)\s*(?:क्रमांक|नं|नंबर|क्र)/)?.[0] ?? unitNo);
    const at = Math.max(0, ascii.indexOf(anchor));
    const near = ascii.slice(Math.max(0, at - 200), at + 400);
    const prefix = unitNo.match(/^([A-Z]{2})-/)?.[1];
    plot = {
      block: kind === "SHOP" ? "" : (bp?.block ?? ""),
      plotNo: unitNo,
      ewFt: numOf(dims?.[1]),
      nsFt: numOf(dims?.[2]),
      areaSqft: numOf(area?.[1]),
      east: bound("पूर्व|पूरब"),
      west: bound("पश्चिम|पश्चिमी"),
      north: bound("उत्तर"),
      south: bound("दक्षिण"),
      corner: /कॉर्नर|कोर्नर|corner|कोने\s*का/i.test(near),
      floor:
        kind === "SHOP"
          ? (near.match(FLOOR_RE)?.[1] ?? (prefix ? FLOOR_OF_PREFIX[prefix] : null) ?? (/^4\d\d$/.test(unitNo) ? "चतुर्थ तल" : null) ?? ascii.match(FLOOR_RE)?.[1] ?? null)
          : null,
    };
  }
  const dates = [...ascii.matchAll(/(?:दिनांक|दि\.)\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/g)];
  const last = dates.at(-1);
  return {
    developer: developerOf(sellerBody),
    seller: sellerBody,
    partners: partnerNames(seller),
    devPermissions,
    maintenance,
    village: villageOf(text),
    ward,
    surveyNos,
    kind,
    plot,
    date: last ? `${last[1]!.padStart(2, "0")}/${last[2]!.padStart(2, "0")}/${last[3]}` : null,
  };
}

// ---------- the standard text ----------
/**
 * The project's standard text from one old deed, paragraph by paragraph:
 * seller → {{PARTNER}}, buyer → {{BUYER}}, the development-permission
 * paragraph(s) → {{DEV_PERMISSION}}, maintenance → one {{MAINTENANCE}}, the
 * बिक्रीधन paragraph with every payment-mode line → {{PAYMENT}}; inside other
 * paragraphs every plot / block / area line → {{PLOT}} and all four boundary
 * lines → {{BOUNDARY}}. Dates blanked; any Aadhaar / PAN / mobile / e-mail → "____".
 */
export function markProjectTemplate(content: string): { template: string; found: string[] } {
  const out: string[] = [];
  const found = new Set<string>();
  const once = (marker: string) => {
    if (found.has(marker)) return null;
    found.add(marker);
    return marker;
  };
  for (const p of paragraphs(content)) {
    const kind = paraKind(p);
    if (kind === "seller") {
      const head = p.match(/^\s*(विक्रेता|विक्रयकर्ता)\s*(पक्ष|गण)?\s*[-:–]*/)![0].trim();
      const m = once("{{PARTNER}}");
      if (m) out.push(`${head} ${m}`);
      continue;
    }
    const marker = { buyer: "{{BUYER}}", dev: "{{DEV_PERMISSION}}", maint: "{{MAINTENANCE}}", payment: "{{PAYMENT}}" }[kind as string];
    if (marker) {
      const m = once(marker);
      if (m) out.push(m);
      continue;
    }
    // Line level: plot / block / area lines, boundary lines, stray payment lines.
    const lines: string[] = [];
    for (const l of p.split("\n")) {
      let m: string | null | undefined;
      if (PLOT_LINE.test(l)) m = found.has("{{PLOT}}") && lines.at(-1) !== "{{PLOT}}" ? undefined : once("{{PLOT}}") ?? null;
      else if (BOUNDARY_HEAD.test(l) || BOUNDARY_LINE.test(l)) m = once("{{BOUNDARY}}") ?? null;
      else if (lineIsPayment(l)) m = once("{{PAYMENT}}") ?? null;
      else {
        lines.push(l.replace(/(दिनांक|दि\.)\s*[\d०-९]{1,2}[./-][\d०-९]{1,2}[./-][\d०-९]{2,4}/g, "$1 ____"));
        continue;
      }
      if (m) lines.push(m);
    }
    if (lines.length) out.push(lines.join("\n"));
  }
  return { template: maskIds(out.join("\n\n")), found: [...found] };
}

/**
 * Sale-specific text still in a standard text (blocks saving): an amount
 * ("36,00,000/- रूपये"), a UTR, a cheque / DD number, or a "ब्लॉक -" line.
 */
export function templateLeftovers(template: string): string[] {
  const t = asciiDigits(cleanText(template));
  const out: string[] = [];
  if (/\d[\d,]*\s*\/-\s*(?:रूपये|रुपये|रु)|(?:रूपये|रुपये|रु\.?)\s*\d[\d,]*\s*\/-/.test(t)) out.push("राशि (जैसे 36,00,000/- रूपये)");
  if (/\bUTR\b|यू\.?\s*टी\.?\s*आर/i.test(t)) out.push("UTR नंबर");
  if (/(चैक|चेक)\s*(क्रमांक|नं|नंबर)/.test(t)) out.push("चैक क्रमांक");
  if (/डी\.\s*डी\./.test(t)) out.push("डी.डी.");
  if (/^\s*(ब्लॉक|ब्लाक)\s*[-:]/m.test(t)) out.push('"ब्लॉक -" वाली पंक्ति');
  return out;
}

// ---------- merging many deeds ----------
function topValues(items: { value: string; src: ColonySource }[], n: number): ColonySourced<string>[] {
  const groups = new Map<string, { value: string; from: ColonySource[]; n: number }>();
  for (const it of items) {
    if (!it.value.trim()) continue;
    const k = key(it.value);
    const g = groups.get(k) ?? { value: it.value.trim(), from: [], n: 0 };
    if (!g.from.some((f) => f.deedId === it.src.deedId)) {
      g.n++;
      g.from.push(it.src);
    }
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => b.n - a.n).slice(0, n).map((g) => ({ value: g.value, from: g.from.slice(0, 5) }));
}
const top1 = (items: { value: string; src: ColonySource }[]) => topValues(items, 1)[0] ?? null;

/** Rough word overlap of two paragraphs (0..1). */
export function overlap(a: string, b: string): number {
  const w = (s: string) => new Set(norm(s).split(/\s+/).filter((x) => x.length > 2));
  const x = w(a);
  const y = w(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const t of x) if (y.has(t)) n++;
  return n / Math.min(x.size, y.size);
}

const words = (s: string) => norm(s).split(/\s+/).filter((x) => x.length > 1).length;
/** Two long paragraphs saying (mostly) the same thing -- short clauses that merely share a word are not repeats. */
export const sameClause = (a: string, b: string) => words(a) >= 8 && words(b) >= 8 && overlap(a, b) >= 0.6;

/** The owner's final maintenance form: payable from the registry date. */
export const FROM_REGISTRY = /(रजिस्ट्री|पंजीयन)\s*(?:दिनांक|तारीख|की तिथि|तिथि)\s*से/;

/** "1 अप्रैल 2026 से" / "रजिस्ट्री दिनांक से" -- where a maintenance clause starts. */
const startPhrase = (p: string) => norm(p).match(/([\d]{1,2}\s*[ऀ-ॿ]+\s*\d{4}\s*से|[\d./-]{8,10}\s*से|रजिस्ट्री\s*(?:दिनांक|तारीख|की तिथि)\s*से|पंजीयन\s*(?:दिनांक|तिथि)\s*से|कब्जा\s*(?:दिनांक|तिथि)?\s*से)/)?.[1] ?? null;

/** Guideline rows whose name matches the project's name / aliases. */
export function guidelineCandidates(names: string[], data: GuidelineEntry[] = GUIDELINE_DATA, n = 5): ColonyGuidelineRow[] {
  const tokens = [...new Set(names.flatMap((x) => norm(x).toUpperCase().split(/[\s,/]+/)).filter((t) => t.length >= 3 && !/^(CITY|ROAD|GRAM|NAGAR|COLONY|सिटी|नगर|ग्राम|रोड|कॉलोनी)$/.test(t)))];
  if (!tokens.length) return [];
  return data
    .map((e) => {
      const hay = `${norm(e.hi)} ${norm(e.en)}`.toUpperCase();
      const hits = tokens.filter((t) => hay.includes(t)).length;
      const phrase = names.some((x) => x.trim().length >= 5 && hay.includes(norm(x).toUpperCase()));
      return { e, score: hits + (phrase ? 2 : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.sno - b.e.sno)
    .slice(0, n)
    .map(({ e }) => ({ sno: e.sno, hi: e.hi, en: e.en, ward: e.ward, plotRes: e.pr, plotCom: e.pc, multiCom: e.multi_com }));
}

// ---------- the Devanagari form of a Latin project name ----------
const WORDS_HI: Record<string, string[]> = {
  flora: ["फ्लोरा"],
  city: ["सिटी", "सिटि"],
  woods: ["वुड्स", "वुडस"],
  wood: ["वुड"],
  business: ["बिजनेस", "बिज़नेस", "बिजनिस"],
  courtyard: ["कोर्टयार्ड", "कोर्ट यार्ड"],
  green: ["ग्रीन"],
  park: ["पार्क"],
  residency: ["रेसीडेंसी", "रेजीडेंसी", "रेसिडेंसी"],
  enclave: ["एन्क्लेव", "एनक्लेव"],
  homes: ["होम्स"],
  valley: ["वैली"],
  garden: ["गार्डन"],
  gardens: ["गार्डन्स"],
  heights: ["हाइट्स"],
  tower: ["टावर"],
  towers: ["टावर्स"],
  plaza: ["प्लाजा", "प्लाज़ा"],
  mall: ["मॉल"],
  complex: ["कॉम्प्लेक्स", "काम्पलेक्स"],
  colony: ["कॉलोनी", "कालोनी"],
  square: ["स्क्वायर"],
  avenue: ["एवेन्यू"],
  vihar: ["विहार"],
  nagar: ["नगर"],
  puram: ["पुरम"],
  dham: ["धाम"],
  kunj: ["कुंज"],
  royal: ["रॉयल"],
  silver: ["सिल्वर"],
  golden: ["गोल्डन"],
  sun: ["सन"],
  shree: ["श्री"],
  shri: ["श्री"],
};
/** Very rough letter-by-letter fallback for a word not in the list. */
function roughHindi(w: string): string {
  const map: [RegExp, string][] = [
    [/^a/, "अ"], [/^e/, "ए"], [/^i/, "इ"], [/^o/, "ओ"], [/^u/, "उ"],
    [/sh/g, "श"], [/ch/g, "च"], [/th/g, "थ"], [/ph/g, "फ"], [/kh/g, "ख"], [/gh/g, "घ"], [/bh/g, "भ"], [/dh/g, "ध"],
    [/oo/g, "ू"], [/ee/g, "ी"], [/aa/g, "ा"], [/ai/g, "ै"], [/au/g, "ौ"],
    [/k|c|q/g, "क"], [/g/g, "ग"], [/j/g, "ज"], [/t/g, "ट"], [/d/g, "ड"], [/n/g, "न"], [/p/g, "प"], [/f/g, "फ"], [/b/g, "ब"], [/m/g, "म"],
    [/y/g, "य"], [/r/g, "र"], [/l/g, "ल"], [/v|w/g, "व"], [/s/g, "स"], [/h/g, "ह"], [/z/g, "ज़"], [/x/g, "क्स"],
    [/a/g, "ा"], [/e/g, "े"], [/i/g, "ि"], [/o/g, "ो"], [/u/g, "ु"],
  ];
  let s = w.toLowerCase();
  for (const [re, h] of map) s = s.replace(re, h);
  return s;
}
/**
 * Devanagari forms of a Latin project name ("FLORA CITY" → "फ्लोरा सिटी",
 * and its distinctive words "फ्लोरा"), so deeds written in Hindi are found.
 */
export function devanagariForms(name: string): string[] {
  const ws = name.toLowerCase().split(/[\s,/-]+/).filter((w) => /^[a-z]+$/.test(w));
  if (!ws.length) return [];
  const per = ws.map((w) => WORDS_HI[w] ?? [roughHindi(w)]);
  const out = new Set<string>([per.map((x) => x[0]!).join(" ")]);
  ws.forEach((w, i) => {
    if (w.length >= 4 && !/^(city|colony|nagar|park|homes|tower|towers|complex|square|business|courtyard|garden|gardens|residency)$/.test(w)) for (const h of per[i]!) out.add(h);
  });
  return [...out];
}

/**
 * The suggestion from many old sale deeds of one project. Sold plots are keyed
 * by block + plot; partner variants by the pair, named after it and ordered by
 * use; development permission and maintenance are whole paragraphs.
 */
export function buildSetupSuggestion(deeds: { id: string; title: string; content: string; date?: Date | null }[], names: string[]): ColonySetupSuggestion {
  const src = (d: { id: string; title: string }): ColonySource => ({ deedId: d.id, title: d.title });
  const facts = deeds.map((d) => ({ d, f: colonyDeedFacts(d.content, d.title) }));
  const warnings: string[] = [];
  const dateOf = (x: { d: { date?: Date | null }; f: ColonyDeedFacts }) =>
    x.f.date ?? (x.d.date ? x.d.date.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");

  const kindCount = facts.filter((x) => x.f.kind === "SHOP").length;
  const kindValue: ColonyProjectKind = kindCount > facts.length / 2 ? "SHOP" : "PLOT";
  const kind: ColonySourced<ColonyProjectKind> | null = facts.length
    ? { value: kindValue, from: facts.filter((x) => x.f.kind === kindValue).slice(0, 5).map((x) => src(x.d)) }
    : null;

  // Partner variants: one per pair, named by the pair ("आयुष-रोहित"), most used first.
  const variants = new Map<string, ColonyPartner & { from: ColonySource[]; n: number }>();
  for (const { d, f } of facts) {
    if (!f.partners.length || !f.seller) continue;
    const pairKey = [...f.partners].sort().join("+");
    const v = variants.get(pairKey);
    if (v) {
      v.n++;
      if (v.from.length < 5) v.from.push(src(d));
      continue;
    }
    const label = f.partners.map((p) => p.split(/\s+/)[0]!).join("-").slice(0, 60);
    let k = label.replace(/[^\p{L}\p{M}\p{N}-]/gu, "").toLowerCase().slice(0, 28) || `p${variants.size + 1}`;
    while ([...variants.values()].some((x) => x.key === k)) k = `${k.slice(0, 26)}2`;
    variants.set(pairKey, { key: k, label, text: f.seller.slice(0, 4000), from: [src(d)], n: 1 });
  }
  const partners = [...variants.values()].sort((a, b) => b.n - a.n).map(({ n: _n, ...p }) => p);
  if (partners.length > 1) warnings.push(`भागीदारों की ${partners.length} जोड़ियाँ मिलीं: ${[...variants.values()].sort((a, b) => b.n - a.n).map((v) => `${v.label} (${v.n} डीड)`).join(", ")}।`);

  const devPermissions = topValues(facts.flatMap(({ d, f }) => f.devPermissions.map((v) => ({ value: v, src: src(d) }))), 2);
  const maint = topValues(facts.flatMap(({ d, f }) => f.maintenance.map((v) => ({ value: v, src: src(d) }))), 8);
  for (const { d, f } of facts) {
    for (let a = 0; a < f.maintenance.length; a++)
      for (let b = a + 1; b < f.maintenance.length; b++)
        if (sameClause(f.maintenance[a]!, f.maintenance[b]!)) {
          const s1 = startPhrase(f.maintenance[a]!);
          const s2 = startPhrase(f.maintenance[b]!);
          const kept = [f.maintenance[a]!, f.maintenance[b]!].find((x) => FROM_REGISTRY.test(norm(x)));
          warnings.push(
            `"${d.title}" में रखरखाव वाला पैरा दो बार है${s1 && s2 && s1 !== s2 ? ` (एक में "${s1}", दूसरे में "${s2}")` : ""} — मानक टेक्स्ट में एक ही रखा गया${kept ? ` ("${startPhrase(kept)}" देय वाला)` : ""}।`,
          );
        }
  }
  const families: ColonySourced<string>[][] = [];
  for (const m of maint) {
    const fam = families.find((x) => x.some((y) => sameClause(y.value, m.value) || overlap(y.value, m.value) >= 0.7));
    if (fam) fam.push(m);
    else families.push([m]);
  }
  const maintenanceChoices: ColonySetupSuggestion["maintenanceChoices"] = [];
  const maintenanceClauses = families.slice(0, 2).map((fam) => {
    const chosen = fam.find((x) => FROM_REGISTRY.test(norm(x.value))) ?? fam[0]!;
    if (fam.length > 1) {
      maintenanceChoices.push({
        chosenStart: startPhrase(chosen.value),
        droppedStarts: fam.filter((x) => x !== chosen).map((x) => startPhrase(x.value) ?? x.value.slice(0, 40)),
      });
    }
    return chosen;
  });

  // The standard text from the most recent deed with the most markers. A marker is kept only when its field has a value.
  let template: ColonySetupSuggestion["template"] = null;
  for (const { d } of facts) {
    const t = markProjectTemplate(d.content);
    const missing = COLONY_MARKERS.filter((m) => !t.template.includes(m));
    if (!template || missing.length < template.missing.length) template = { value: t.template, from: [src(d)], found: t.found, missing };
    if (!missing.length) break;
  }
  if (template && template.value.includes("{{DEV_PERMISSION}}") && !devPermissions.length) warnings.push("मानक टेक्स्ट में {{DEV_PERMISSION}} है पर अनुमति वाला पैरा नहीं मिला — खाना भरें।");

  // Sold plots / units, keyed by block + plot; the newest deed wins, repeats listed with both deeds.
  const plots: ColonySetupSuggestion["plots"] = [];
  const byKey = new Map<string, { title: string; date: string }[]>();
  for (const x of facts) {
    const { d, f } = x;
    if (!f.plot || MASTER_DEED.test(norm(d.title))) continue;
    const k = `${f.plot.block}|${f.plot.plotNo}`;
    const seen = byKey.get(k);
    const me = { title: d.title, date: dateOf(x) };
    if (seen) {
      seen.push(me);
      continue;
    }
    byKey.set(k, [me]);
    plots.push({ ...f.plot, from: src(d) });
    if (boundaryNamesSelf(f.plot)) warnings.push(`"${d.title}" की चतुःसीमा में वही ${f.kind === "SHOP" ? "यूनिट" : "प्लाट"} नंबर (${f.plot.plotNo}) लिखा है जो बिक रहा है।`);
  }
  for (const [k, list] of byKey) {
    if (list.length < 2) continue;
    const [block, plotNo] = k.split("|");
    warnings.push(
      `${block ? `ब्लॉक ${block} ` : ""}${kindValue === "SHOP" ? "यूनिट" : "प्लाट"} ${plotNo}: ${list.length} डीड — ${list.map((x) => `"${x.title}" (${x.date})`).join(", ")} — पुनर्विक्रय / दोहरी बिक्री जाँचें।`,
    );
  }

  return {
    deeds: deeds.map(src),
    kind,
    developer: top1(facts.map(({ d, f }) => ({ value: f.developer ?? "", src: src(d) }))),
    village: top1(facts.map(({ d, f }) => ({ value: f.village ?? "", src: src(d) }))),
    ward: top1(facts.map(({ d, f }) => ({ value: f.ward ?? "", src: src(d) }))),
    surveyNos: top1(facts.map(({ d, f }) => ({ value: f.surveyNos.join(", "), src: src(d) }))),
    partners,
    devPermissions,
    maintenanceClauses,
    maintenanceChoices,
    template,
    plots,
    guideline: guidelineCandidates(names),
    warnings,
  };
}

// ---------- checks on a generated deed ----------
/** A boundary that names the plot / unit being sold ("दक्षिण - प्लाट 20" while selling plot 20). */
export function boundaryNamesSelf(p: { plotNo: string; east: string | null; west: string | null; north: string | null; south: string | null }): string | null {
  const no = asciiDigits(p.plotNo).toUpperCase();
  const re = new RegExp(`(?:प्ला(?:ट|ॅट)|plot|दुकान|यूनिट|unit)\\s*(?:क्रमांक|नं\\.?|नंबर|no\\.?)?\\s*[-:]?\\s*${no.replace(/[-]/g, "\\s*-?\\s*")}(?![\\dA-Z])`, "i");
  for (const [dir, v] of [["पूर्व", p.east], ["पश्चिम", p.west], ["उत्तर", p.north], ["दक्षिण", p.south]] as const) {
    if (v && re.test(asciiDigits(cleanText(v)).toUpperCase())) return dir;
  }
  return null;
}

/** Maintenance paragraphs that repeat in a deed / template (with their differing start). */
export function duplicateClauses(text: string): { a: string; b: string } | null {
  const ps = paragraphs(text).filter((p) => MAINT_RE.test(p));
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) if (sameClause(ps[i]!, ps[j]!)) return { a: startPhrase(ps[i]!) ?? ps[i]!.slice(0, 40), b: startPhrase(ps[j]!) ?? ps[j]!.slice(0, 40) };
  return null;
}

// ---------- guideline value (office calculator) ----------
const SQM_PER_SQFT_CALC = 0.092903;
/**
 * The guideline value of a plot / unit from the office calculator: plot →
 * plotValue (residential, corner +10% the calculator way); SHOP unit →
 * flatValue (multi-storey commercial). Falls back to rate × area only when no
 * guideline row is chosen.
 */
export function colonyGuideline(
  project: { kind: string; guidelineSno: number | null; guidelineRatePerSqm: number | null },
  plot: { areaSqft: number | null; ewFt: number | null; nsFt: number | null; corner: boolean },
  data: GuidelineEntry[] = GUIDELINE_DATA,
): { value: number; rate: number; how: string } | null {
  const sqft = plot.areaSqft ?? (plot.ewFt && plot.nsFt ? plot.ewFt * plot.nsFt : null);
  if (!sqft) return null;
  const sqm = plotAreaToSqm(sqft, "sqft");
  const entry = project.guidelineSno ? data.find((e) => e.sno === project.guidelineSno) : undefined;
  if (entry) {
    if (project.kind === "SHOP") {
      const r = flatValue({ entry, areaSqm: sqm, commercial: true });
      if (r.rate > 0) return { value: Math.round(r.value), rate: r.rate, how: `गाइडलाइन क्र. ${entry.sno} (बहुमंजिला व्यावसायिक) ₹${r.rate}/वर्गमीटर` };
    }
    const r = plotValue({ entry, areaSqm: sqm, use: "res", corner: plot.corner });
    return { value: Math.round(r.value), rate: r.rate, how: `गाइडलाइन क्र. ${entry.sno} ₹${r.baseRate}/वर्गमीटर${plot.corner ? " + कॉर्नर 10%" : ""}` };
  }
  if (project.guidelineRatePerSqm) {
    const rate = project.guidelineRatePerSqm * (plot.corner ? 1.1 : 1);
    return { value: Math.round(sqft * SQM_PER_SQFT_CALC * rate), rate, how: `₹${project.guidelineRatePerSqm}/वर्गमीटर${plot.corner ? " + कॉर्नर 10%" : ""}` };
  }
  return null;
}
