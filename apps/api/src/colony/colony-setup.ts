import {
  type ColonyGuidelineRow,
  type ColonyPartner,
  type ColonyProjectKind,
  type ColonySetupSuggestion,
  type ColonySource,
  type ColonySourced,
  COLONY_MARKERS,
} from "@sampada/shared";
import { placeOf } from "../ai-draft/archive-text.js";
import { flatValue, GUIDELINE_DATA, type GuidelineEntry, plotAreaToSqm, plotValue } from "../whatsapp/guideline/calculator.js";

/**
 * Pure rules for "Setup from the old deeds": what an old sale deed of a colony /
 * commercial project says (developer, partner pair, development permissions,
 * maintenance clauses, place, the plot / unit), the merged suggestion across
 * many deeds, the marked standard text, the guideline value from the office
 * calculator, and the checks on a generated deed. No party's Aadhaar / PAN /
 * mobile ever goes into the standard text.
 */

const DEV = "०१२३४५६७८९";
export const asciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));
const norm = (s: string) => asciiDigits(s).replace(/[़]/g, "").replace(/\s+/g, " ").trim();
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

// ---------- recognisers ----------
const SELLER_HEAD = /^\s*(विक्रेता|विक्रयकर्ता)\s*(पक्ष|गण)?/;
const BUYER_HEAD = /^\s*(क्रेता|क्रयकर्ता)\s*(पक्ष|गण)?/;
const DEV_RE = /(अनुमति|स्वीकृति|अनुज्ञा|अनुज्ञप्ति|परमिशन|permission|नगर तथा ग्राम निवेश|टी\.?\s*एन\.?\s*सी\.?\s*पी|T\s*&\s*C\s*P|रेरा|RERA|कॉलोनी\s*सेल|विकास\s*अनुमति)/i;
const DEV_REF_RE = /(क्रमांक|क्र\.|नं\.|No\.?|दिनांक)/i;
const MAINT_RE = /(रखरखाव|रख-रखाव|रख रखाव|मेंटेनेंस|मेन्टेनेन्स|मेंटेनेन्स|अनुरक्षण|maintenance)/i;
const PLOT_LINE = /^\s*(ब्लॉक|ब्लाक|प्ला(ट|ॅट)\s*(क्रमांक|नं)|क्षेत्रफल|(दुकान|शॉप|यूनिट|इकाई)\s*(क्रमांक|नं|नंबर)?|(भूतल|प्रथम|द्वितीय|तृतीय|चतुर्थ|पंचम)\s*तल|तल\s*[-:]|मंजिल|मंज़िल)/;
const BOUNDARY_LINE = /^\s*(पूर्व|पश्चिम|उत्तर|दक्षिण)\s*(में|दिशा में)?\s*[-:]/;
const BOUNDARY_HEAD = /चतुःसीमा|चतुर्सीमा|चौहद्दी/;
const PAYMENT_LINE = (l: string) => /प्रतिफल|(रु|रू)\.?\s*[\d०-९]/.test(l) && /(प्राप्त|भुगतान|अदा|नकद|चेक|चैक)/.test(l);
const SHOP_RE = /(दुकान|शॉप|shop|यूनिट|unit|कार्यालय\s*क्रमांक|ऑफिस\s*क्रमांक)\s*(क्रमांक|नं\.?|नंबर|no\.?)?\s*[-:]?\s*([A-Z]{0,3}\s*-?\s*\d{1,4}[A-Z]?)/i;
const FLOOR_RE = /(भूतल|ग्राउंड\s*फ्लोर|प्रथम\s*तल|द्वितीय\s*तल|तृतीय\s*तल|चतुर्थ\s*तल|पंचम\s*तल|(?:ground|first|second|third|fourth|fifth)\s*floor|लोअर\s*ग्राउंड|अपर\s*ग्राउंड)/i;

/** Paragraphs (blank-line separated). */
const paragraphs = (content: string) =>
  content
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** The block after a heading line, up to a blank line. */
function blockAfter(content: string, head: RegExp): string {
  const lines = content.replace(/\r/g, "").split("\n");
  const i = lines.findIndex((l) => head.test(l));
  if (i < 0) return "";
  const out: string[] = [];
  for (let k = i; k < lines.length && (k === i || lines[k]!.trim()); k++) out.push(lines[k]!);
  return out.join("\n");
}

/** Names after "भागीदार" / "एवं श्री" in the seller block. */
export function partnerNames(seller: string): string[] {
  const out: string[] = [];
  const s = seller.split(/\n/).join(" ");
  const NAME = "([\\u0900-\\u097F]{2,}(?:\\s[\\u0900-\\u097F]{2,}){0,2})";
  const STOP = /\s(पुत्र|पुत्री|पत्नी|पति|उम्र|आयु|निवासी|नि\.|जाति|व्यवसाय|पता|द्वारा|एवं|तथा|और|आधार|पैन)(\s|$).*/;
  for (const m of s.matchAll(new RegExp(`(?:भागीदार(?:गण)?|पार्टनर|एवं|तथा|व)\\s*[:-]?\\s*(?:श्री|श्रीमती)\\s*${NAME}`, "g"))) {
    const name = m[1]!.replace(STOP, "").trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
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
}

const numOf = (s: string | undefined) => {
  const v = Number(asciiDigits(s ?? "").replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** What one old deed says. */
export function colonyDeedFacts(content: string): ColonyDeedFacts {
  const text = content.replace(/\r/g, "");
  const ascii = asciiDigits(text);
  const seller = blockAfter(text, SELLER_HEAD);
  const sellerBody = seller.replace(SELLER_HEAD, "").replace(/^\s*[-:–]\s*/, "").trim();
  const developer = sellerBody.match(/((?:मेसर्स|मै\.|M\/s\.?|मे\.)\s*[^\n]*?)(?=\s+द्वारा|\s+के\s+(?:भागीदार|पार्टनर)|$)/i)?.[1]?.replace(/[,।\s]+$/, "").trim() ?? null;

  const sentences = paragraphs(text).flatMap((p) => p.split(/(?<=।)\s*/)).map((x) => x.trim()).filter(Boolean);
  const devPermissions = sentences.filter((x) => DEV_RE.test(x) && DEV_REF_RE.test(x) && !BUYER_HEAD.test(x) && x.length <= 600);
  const maintenance = paragraphs(text).filter((p) => MAINT_RE.test(p) && !SELLER_HEAD.test(p) && !BUYER_HEAD.test(p));

  const place = placeOf(text);
  const surveyNos = [...new Set([...ascii.matchAll(/(?:सर्वे|खसरा)\s*(?:क्रमांक|नं\.?|नंबर|क्र\.?)\s*[-:]?\s*([\d/]+(?:\s*(?:,|एवं|व|और)\s*[\d/]+)*)/g)].flatMap((m) => m[1]!.split(/\s*(?:,|एवं|व|और)\s*/)).filter(Boolean))];

  const shop = ascii.match(SHOP_RE);
  const blockM = ascii.match(/(?:ब्लॉक|ब्लाक|block)\s*(?:नं\.?|क्रमांक|क्र\.?)?\s*[-:]?\s*([A-Za-z0-9]{1,3})(?=[\s,।]|$)/i);
  const plotM = ascii.match(/प्ला(?:ट|ॅट)\s*(?:क्रमांक|नं\.?|नंबर|क्र\.?)\s*[-:]?\s*(\d{1,4}[A-Za-z]?)/);
  const kind: ColonyProjectKind = shop && !plotM ? "SHOP" : "PLOT";
  const dims = ascii.match(/([\d.]+)\s*(?:फुट|फीट|ft)\s*[xX×*]\s*([\d.]+)\s*(?:फुट|फीट|ft)/);
  const area = ascii.match(/([\d.,]+)\s*(?:वर्गफुट|वर्ग फुट|वर्गफीट|वर्ग फीट|sq\.?\s*ft)/i);
  const bound = (dir: string) => {
    const m = text.match(new RegExp(`^\\s*${dir}\\s*(?:में|दिशा में)?\\s*[-:]\\s*(.+)$`, "m"));
    return m ? m[1]!.replace(/[।]\s*$/, "").trim() : null;
  };
  let plot: ColonyDeedFacts["plot"] = null;
  const unitNo = kind === "SHOP" ? shop![3]!.replace(/\s+/g, "").toUpperCase() : plotM?.[1];
  if (unitNo) {
    const at = ascii.indexOf(kind === "SHOP" ? shop![0]! : plotM![0]!);
    const near = ascii.slice(Math.max(0, at - 200), at + 400);
    plot = {
      block: kind === "SHOP" ? "" : (blockM?.[1]?.toUpperCase() ?? ""),
      plotNo: unitNo,
      ewFt: numOf(dims?.[1]),
      nsFt: numOf(dims?.[2]),
      areaSqft: numOf(area?.[1]),
      east: bound("पूर्व"),
      west: bound("पश्चिम"),
      north: bound("उत्तर"),
      south: bound("दक्षिण"),
      corner: /कॉर्नर|कोर्नर|corner|कोने\s*का/i.test(near),
      floor: kind === "SHOP" ? (near.match(FLOOR_RE)?.[1] ?? ascii.match(FLOOR_RE)?.[1] ?? null) : null,
    };
  }
  return {
    developer,
    seller: sellerBody,
    partners: partnerNames(seller),
    devPermissions,
    maintenance,
    village: place.village ?? place.colony,
    ward: place.ward,
    surveyNos,
    kind,
    plot,
  };
}

// ---------- the standard text ----------
/**
 * The project's standard text from one old deed: seller block → {{PARTNER}},
 * buyer block → {{BUYER}}, plot / unit lines → {{PLOT}}, boundaries →
 * {{BOUNDARY}}, payment → {{PAYMENT}}, the development permissions →
 * {{DEV_PERMISSION}} and the maintenance paragraph(s) → one {{MAINTENANCE}}
 * (a second maintenance paragraph is dropped: deeds carried it twice).
 * Dates blanked, any Aadhaar / PAN / mobile / e-mail left → "____".
 */
export function markProjectTemplate(content: string): { template: string; found: string[] } {
  const lines = content.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  const found = new Set<string>();
  const put = (marker: string, prefix = "") => {
    if (!found.has(marker)) out.push(prefix + marker);
    found.add(marker);
  };
  let i = 0;
  const skipBlock = () => {
    while (i < lines.length && lines[i]!.trim()) i++;
  };
  while (i < lines.length) {
    const l = lines[i]!;
    if (SELLER_HEAD.test(l)) {
      const head = l.match(/^\s*(विक्रेता|विक्रयकर्ता)\s*(पक्ष|गण)?\s*[-:–]?/)![0];
      skipBlock();
      put("{{PARTNER}}", `${head.trim()} `);
      continue;
    }
    if (BUYER_HEAD.test(l)) {
      skipBlock();
      put("{{BUYER}}");
      continue;
    }
    if (PLOT_LINE.test(l)) {
      while (i < lines.length && PLOT_LINE.test(lines[i]!)) i++;
      put("{{PLOT}}");
      continue;
    }
    if (BOUNDARY_HEAD.test(l) || BOUNDARY_LINE.test(l)) {
      while (i < lines.length && (BOUNDARY_HEAD.test(lines[i]!) || BOUNDARY_LINE.test(lines[i]!))) i++;
      put("{{BOUNDARY}}");
      continue;
    }
    if (PAYMENT_LINE(l)) {
      skipBlock();
      put("{{PAYMENT}}");
      continue;
    }
    if (DEV_RE.test(l) && DEV_REF_RE.test(l)) {
      skipBlock();
      if (!found.has("{{DEV_PERMISSION}}")) put("{{DEV_PERMISSION}}");
      continue;
    }
    if (MAINT_RE.test(l)) {
      skipBlock();
      if (!found.has("{{MAINTENANCE}}")) put("{{MAINTENANCE}}");
      continue;
    }
    out.push(l.replace(/(दिनांक|दि\.)\s*[\d०-९]{1,2}[./-][\d०-९]{1,2}[./-][\d०-९]{2,4}/g, "$1 ____"));
    i++;
  }
  return { template: maskIds(out.join("\n").replace(/\n{3,}/g, "\n\n")), found: [...found] };
}

// ---------- merging many deeds ----------
function topValues(items: { value: string; src: ColonySource }[], n: number): ColonySourced<string>[] {
  const groups = new Map<string, { value: string; from: ColonySource[] }>();
  for (const it of items) {
    if (!it.value.trim()) continue;
    const k = key(it.value);
    const g = groups.get(k) ?? { value: it.value.trim(), from: [] };
    if (!g.from.some((f) => f.deedId === it.src.deedId)) g.from.push(it.src);
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => b.from.length - a.from.length).slice(0, n).map((g) => ({ value: g.value, from: g.from.slice(0, 5) }));
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

/**
 * The suggestion from many old deeds of one project. Partners: one variant
 * per distinct pair; the partner present in (nearly) every deed is common and
 * the variant is named after the other one.
 */
export function buildSetupSuggestion(deeds: { id: string; title: string; content: string }[], names: string[]): ColonySetupSuggestion {
  const src = (d: { id: string; title: string }): ColonySource => ({ deedId: d.id, title: d.title });
  const facts = deeds.map((d) => ({ d, f: colonyDeedFacts(d.content) }));
  const warnings: string[] = [];

  const kindCount = facts.filter((x) => x.f.kind === "SHOP").length;
  const kind: ColonySourced<ColonyProjectKind> | null = facts.length
    ? { value: kindCount > facts.length / 2 ? "SHOP" : "PLOT", from: facts.filter((x) => x.f.kind === (kindCount > facts.length / 2 ? "SHOP" : "PLOT")).slice(0, 5).map((x) => src(x.d)) }
    : null;

  // Partners: count each name; the common one is in most deeds.
  const count = new Map<string, number>();
  for (const { f } of facts) for (const p of f.partners) count.set(p, (count.get(p) ?? 0) + 1);
  const withPartners = facts.filter((x) => x.f.partners.length).length;
  const common = [...count.entries()].filter(([, c]) => c >= Math.max(2, Math.ceil(withPartners * 0.8))).map(([n]) => n);
  const variants = new Map<string, ColonyPartner & { from: ColonySource[] }>();
  for (const { d, f } of facts) {
    if (!f.partners.length || !f.seller) continue;
    const pairKey = [...f.partners].sort().join("+");
    const other = f.partners.find((p) => !common.includes(p)) ?? f.partners[0]!;
    const v = variants.get(pairKey);
    if (v) {
      if (v.from.length < 5) v.from.push(src(d));
      continue;
    }
    const label = other.split(/\s+/)[0]!;
    let k = label.replace(/[^\p{L}\p{M}\p{N}]/gu, "").toLowerCase().slice(0, 24) || `p${variants.size + 1}`;
    while ([...variants.values()].some((x) => x.key === k)) k += "2";
    variants.set(pairKey, { key: k, label, text: f.seller.slice(0, 4000), from: [src(d)] });
  }
  if (common.length) warnings.push(`हर डीड में साझा भागीदार: ${common.join(", ")}; दूसरे भागीदार के हिसाब से ${variants.size} रूप बने।`);

  const devPermissions = topValues(facts.flatMap(({ d, f }) => f.devPermissions.map((v) => ({ value: v, src: src(d) }))), 2);
  const maint = topValues(facts.flatMap(({ d, f }) => f.maintenance.map((v) => ({ value: v, src: src(d) }))), 4);
  // Two maintenance paragraphs in one deed that say the same thing with different start dates: the deed repeated it.
  for (const { d, f } of facts) {
    for (let a = 0; a < f.maintenance.length; a++)
      for (let b = a + 1; b < f.maintenance.length; b++)
        if (sameClause(f.maintenance[a]!, f.maintenance[b]!)) {
          const s1 = startPhrase(f.maintenance[a]!);
          const s2 = startPhrase(f.maintenance[b]!);
          warnings.push(`"${d.title}" में रखरखाव वाला पैरा दो बार है${s1 && s2 && s1 !== s2 ? ` (एक में "${s1}", दूसरे में "${s2}")` : ""} — मानक टेक्स्ट में एक ही रखा गया।`);
        }
  }
  const maintenanceClauses = maint.filter((m, i) => !maint.slice(0, i).some((x) => overlap(x.value, m.value) >= 0.7)).slice(0, 2);

  // The standard text from the most recent deed that has all four main blocks.
  let template: ColonySetupSuggestion["template"] = null;
  for (const { d } of facts) {
    const t = markProjectTemplate(d.content);
    const missing = COLONY_MARKERS.filter((m) => !t.template.includes(m));
    if (!template || missing.length < template.missing.length) template = { value: t.template, from: [src(d)], found: t.found, missing };
    if (!missing.length) break;
  }

  const plots: ColonySetupSuggestion["plots"] = [];
  const seen = new Set<string>();
  for (const { d, f } of facts) {
    if (!f.plot) continue;
    const k = `${f.plot.block}|${f.plot.plotNo}`;
    if (seen.has(k)) {
      warnings.push(`${f.plot.block ? `ब्लॉक ${f.plot.block} ` : ""}${f.kind === "SHOP" ? "यूनिट" : "प्लाट"} ${f.plot.plotNo} एक से ज़्यादा डीड में है ("${d.title}") — दोहरी बिक्री / संशोधन जाँचें।`);
      continue;
    }
    seen.add(k);
    plots.push({ ...f.plot, from: src(d) });
    if (boundaryNamesSelf(f.plot)) warnings.push(`"${d.title}" की चतुःसीमा में वही ${f.kind === "SHOP" ? "यूनिट" : "प्लाट"} नंबर (${f.plot.plotNo}) लिखा है जो बिक रहा है।`);
  }

  return {
    deeds: deeds.map(src),
    kind,
    developer: top1(facts.map(({ d, f }) => ({ value: f.developer ?? "", src: src(d) }))),
    village: top1(facts.map(({ d, f }) => ({ value: f.village ?? "", src: src(d) }))),
    ward: top1(facts.map(({ d, f }) => ({ value: f.ward ?? "", src: src(d) }))),
    surveyNos: top1(facts.map(({ d, f }) => ({ value: f.surveyNos.join(", "), src: src(d) }))),
    partners: [...variants.values()],
    devPermissions,
    maintenanceClauses,
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
    if (v && re.test(asciiDigits(v).toUpperCase())) return dir;
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
