import { inflateRawSync } from "node:zlib";
import {
  type ColonyBuyer,
  type ColonyCheck,
  COLONY_MARKERS,
  formatParty,
  formatPartyBlock,
  type Instalment,
  missingSampadaFields,
  numberToHindiRupees,
} from "@sampada/shared";

/**
 * Pure rules for colony auto-drafts: the template from an old project deed
 * (4 blocks marked), the 4 blocks for a new sale, the checks, and readers for
 * the plot master (CSV / XLSX) and the company's WhatsApp text.
 */

const SQM_PER_SQFT = 0.09290304;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const CASH_LIMIT = 200_000;

// ---------- template ----------
/**
 * Suggests the colony template from an old deed of the project: the buyer
 * paragraph, the "ब्लॉक / प्लाट क्रमांक / क्षेत्रफल" lines, the चतुःसीमा
 * lines and the payment paragraph become {{BUYER}} {{PLOT}} {{BOUNDARY}}
 * {{PAYMENT}}. The owner checks / edits it before saving.
 */
export function suggestTemplate(content: string): { template: string; found: string[] } {
  const lines = content.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  const found = new Set<string>();
  let i = 0;
  const put = (marker: string) => {
    if (!found.has(marker)) out.push(marker);
    found.add(marker);
  };
  while (i < lines.length) {
    const l = lines[i]!;
    if (/^\s*क्रेता\s*पक्ष/.test(l)) {
      // The buyer block runs until a blank line.
      while (i < lines.length && lines[i]!.trim()) i++;
      put("{{BUYER}}");
      continue;
    }
    if (/^\s*(ब्लॉक|ब्लाक)\s*[-:]/.test(l) || /^\s*प्ला(ट|ॅट)\s*(क्रमांक|नं)/.test(l)) {
      while (i < lines.length && /^\s*(ब्लॉक|ब्लाक|प्ला(ट|ॅट)\s*(क्रमांक|नं)|क्षेत्रफल)/.test(lines[i]!)) i++;
      put("{{PLOT}}");
      continue;
    }
    if (/चतुःसीमा|चतुर्सीमा|चौहद्दी/.test(l) || /^\s*(पूर्व|पश्चिम|उत्तर|दक्षिण)\s*(में|दिशा में)?\s*[-:]/.test(l)) {
      while (i < lines.length && (/चतुःसीमा|चतुर्सीमा|चौहद्दी/.test(lines[i]!) || /^\s*(पूर्व|पश्चिम|उत्तर|दक्षिण)\s*(में|दिशा में)?\s*[-:]/.test(lines[i]!))) i++;
      put("{{BOUNDARY}}");
      continue;
    }
    if (/प्रतिफल|(रु|रू)\.?\s*[\d०-९]/.test(l) && /(प्राप्त|भुगतान|अदा|नकद|चेक|चैक)/.test(l)) {
      while (i < lines.length && lines[i]!.trim()) i++;
      put("{{PAYMENT}}");
      continue;
    }
    // The old deed's dates (closing "इति ..., दिनांक ...") are for staff to fill in each deed.
    out.push(l.replace(/(दिनांक|दि\.)\s*[\d०-९]{1,2}[./-][\d०-९]{1,2}[./-][\d०-९]{2,4}/g, "$1 ____"));
    i++;
  }
  return { template: out.join("\n"), found: [...found] };
}

export function missingMarkers(template: string): string[] {
  return COLONY_MARKERS.filter((m) => !template.includes(m));
}

// ---------- the 4 blocks ----------
export function plotLabel(block: string, plotNo: string): string {
  return block ? `ब्लॉक ${block} - प्लाट ${plotNo}` : `यूनिट ${plotNo}`;
}

export function buyerBlock(buyers: (ColonyBuyer & { aadhaarText?: string; panText?: string })[]): string {
  const parties = buyers.map((b) =>
    formatParty({ name: b.name, relation: b.relation, guardian: b.guardian, aadhaar: b.aadhaarText ?? (b.aadhaar || null), pan: b.panText ?? (b.pan || null) }),
  );
  return formatPartyBlock("क्रेता पक्ष", parties);
}

export function plotBlock(
  p: { block: string; plotNo: string; ewFt: number | null; nsFt: number | null; areaSqft: number | null; floor?: string | null },
  kind: string = "PLOT",
): string {
  const sqft = p.areaSqft ?? (p.ewFt && p.nsFt ? p.ewFt * p.nsFt : null);
  const dims = p.ewFt && p.nsFt ? `${r2(p.ewFt)} फुट x ${r2(p.nsFt)} फुट होकर ` : "";
  if (kind === "SHOP") {
    // The wording of the office's shop deeds ("प्रकोष्‍ठ/SHOP क्रमांक - TF - 21", "फ्‍लोर - Third", "एरिया - …").
    return [
      `प्रकोष्ठ/SHOP क्रमांक - ${p.plotNo.replace(/\s*-\s*/g, " - ")}`,
      `फ्लोर - ${floorEn(p.floor) || "____"}`,
      sqft ? `एरिया - ${r2(sqft)} वर्गफुट यानि ${r2(sqft * SQM_PER_SQFT)} वर्गमीटर है।` : "एरिया - ____",
    ].join("\n");
  }
  return [
    `ब्लॉक - ${p.block}`,
    `प्लाट क्रमांक - ${p.plotNo}`,
    sqft ? `क्षेत्रफल - ${dims}${r2(sqft)} वर्गफुट यानी ${r2(sqft * SQM_PER_SQFT)} वर्गमीटर है` : "क्षेत्रफल - ____",
  ].join("\n");
}

/** "तृतीय तल" → "Third" (shop deeds write the floor in English). */
export function floorEn(floor: string | null | undefined): string {
  const f = (floor ?? "").trim();
  const map: [RegExp, string][] = [[/लोअर\s*ग्राउंड/, "Lower Ground"], [/अपर\s*ग्राउंड/, "Upper Ground"], [/भूतल|ग्राउंड/, "Ground"], [/प्रथम/, "First"], [/द्वितीय/, "Second"], [/तृतीय/, "Third"], [/चतुर्थ/, "Fourth"], [/पंचम/, "Fifth"]];
  return map.find(([re]) => re.test(f))?.[1] ?? f.replace(/\s*floor$/i, "").replace(/^\w/, (c) => c.toUpperCase());
}

export function boundaryBlock(p: { east: string | null; west: string | null; north: string | null; south: string | null }, kind: string = "PLOT"): string {
  const v = (x: string | null) => (x?.trim() ? x.trim() : "____");
  if (kind === "SHOP") return [`पूरब दिशा में : ${v(p.east)}`, `पश्चिम दिशा में : ${v(p.west)}`, `उत्तर दिशा में : ${v(p.north)}`, `दक्षिण दिशा में : ${v(p.south)}`].join("\n");
  return ["जिसकी चतुःसीमा निम्न प्रकार है -", `पूर्व - ${v(p.east)}`, `पश्चिम - ${v(p.west)}`, `उत्तर - ${v(p.north)}`, `दक्षिण - ${v(p.south)}`].join("\n");
}

const MODE_HI: Record<string, string> = { cash: "नकद", cheque: "चैक", upi: "यू.पी.आई.", rtgs: "आर.टी.जी.एस./एन.ई.एफ.टी.", dd: "डिमांड ड्राफ्ट", loan: "बैंक ऋण" };
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const inr = (n: number) => n.toLocaleString("en-IN");

export function paymentBlock(consideration: number, inst: Instalment[]): string {
  const lines = [
    `उक्त विक्रीत प्लाट का प्रतिफल रूपये ${inr(consideration)}/- (${numberToHindiRupees(consideration)}) विक्रेता ने क्रेता से निम्नानुसार प्राप्त कर लिया है -`,
    ...inst.map((x, i) => `${i + 1}. दिनांक ${dmy(x.date)} को रूपये ${inr(x.amount)}/- ${MODE_HI[x.mode] ?? x.mode}${x.ref ? ` (${x.ref})` : ""} द्वारा`),
    "अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है।",
  ];
  return lines.join("\n");
}

/** The template with every marker filled. */
export function fillTemplate(template: string, v: Record<string, string>): string {
  return template.replace(/\{\{(BUYER|PLOT|BOUNDARY|PAYMENT|PARTNER|DEV_PERMISSION|MAINTENANCE)\}\}/g, (m, k: string) => v[k] ?? m);
}

export function deedTitle(project: string, block: string, plotNo: string, buyer: string): string {
  return `विक्रय पत्र — ${project} ब्लॉक ${block} प्लाट ${plotNo} — ${buyer}`.slice(0, 200);
}

// ---------- checks ----------
export function saleChecks(input: {
  consideration: number;
  instalments: Instalment[];
  buyers: ColonyBuyer[];
  plot: { areaSqft: number | null; ewFt: number | null; nsFt: number | null };
  /** From the office guideline calculator (colonyGuideline). */
  guideline: { value: number; how: string } | null;
  otherSaleOfPlot: boolean;
  plotSold: boolean;
}): ColonyCheck[] {
  const out: ColonyCheck[] = [];
  if (input.plotSold || input.otherSaleOfPlot) out.push({ level: "error", code: "doubleSale", message: "यह प्लाट पहले ही बिक चुका है / इसकी दूसरी बिक्री दर्ज है।" });
  const total = input.instalments.reduce((a, x) => a + x.amount, 0);
  if (total !== input.consideration) {
    out.push({ level: "error", code: "paymentTotal", message: `किश्तों का जोड़ ₹${inr(total)} प्रतिफल ₹${inr(input.consideration)} के बराबर नहीं है।` });
  }
  const cash = input.instalments.filter((x) => x.mode === "cash");
  if (cash.some((x) => x.amount >= CASH_LIMIT) || cash.reduce((a, x) => a + x.amount, 0) >= CASH_LIMIT) {
    out.push({ level: "warning", code: "cashLimit", message: "नकद भुगतान ₹2 लाख या अधिक है (आयकर धारा 269ST) — जाँचें।" });
  }
  const { areaSqft, ewFt, nsFt } = input.plot;
  if (areaSqft && ewFt && nsFt && Math.abs(ewFt * nsFt - areaSqft) / areaSqft > 0.01) {
    out.push({ level: "warning", code: "areaMismatch", message: `नाप (${ewFt} x ${nsFt} = ${r2(ewFt * nsFt)} वर्गफुट) और क्षेत्रफल (${areaSqft} वर्गफुट) मेल नहीं खाते।` });
  }
  if (input.guideline && input.consideration < input.guideline.value) {
    out.push({
      level: "warning",
      code: "belowGuideline",
      message: `प्रतिफल गाइडलाइन मूल्य (₹${inr(input.guideline.value)}; ${input.guideline.how}) से कम है — स्टाम्प शुल्क गाइडलाइन पर लगेगा।`,
    });
  }
  input.buyers.forEach((b, i) => {
    const miss = missingSampadaFields({
      name: b.name,
      guardian: b.guardian,
      motherName: b.motherName,
      aadhaar: b.aadhaar,
      mobile: b.mobile,
      email: b.email,
      address: b.address,
    } as any);
    if (miss.length) out.push({ level: "warning", code: "sampadaFields", message: `क्रेता ${i + 1}: संपदा 2.0 के लिए अधूरा (${miss.length} जानकारी बाकी)।` });
  });
  return out;
}

// ---------- plot master import ----------
/** CSV (comma / semicolon / tab) or XLSX (first sheet) → rows of strings. */
export function readTable(buf: Buffer, fileName: string): string[][] {
  if (/\.xlsx$/i.test(fileName) || buf.subarray(0, 2).toString() === "PK") return readXlsx(buf);
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const sep = (text.split("\n")[0]!.match(/[;\t]/) ?? [","])[0]!;
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => splitCsv(l, sep));
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) out.push(cur.trim()), (cur = "");
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Minimal XLSX reader: zip central directory → sharedStrings + first worksheet. */
export function readXlsx(buf: Buffer): string[][] {
  const files = unzip(buf);
  const xmlText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xmlText([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const sheet = sheetName ? files.get(sheetName)! : "";
  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1]!.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1] ?? "";
      const col = ref ? [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length;
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const inner = cm[2] ?? "";
      let v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      if (type === "s") v = shared[Number(v)] ?? "";
      else if (type === "inlineStr") v = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("");
      while (row.length < col) row.push("");
      row[col] = xmlText(v).trim();
    }
    if (row.some((c) => c)) rows.push(row);
  }
  return rows;
}

function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + csize);
    if (/\.xml$/.test(name)) out.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export interface PlotRow {
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
}

const HEADERS: Record<keyof PlotRow, RegExp> = {
  block: /^(ब्लॉक|ब्लाक|block)$/i,
  plotNo: /^(प्ला(ट|ॅट)\s*(क्रमांक|नं\.?|नंबर)?|plot\s*(no\.?|number)?)$/i,
  ewFt: /^(पूर्व.?पश्चिम|ew|e-w|east.?west|चौड़ाई|width)(\s*\(.*\))?$/i,
  nsFt: /^(उत्तर.?दक्षिण|ns|n-s|north.?south|लंबाई|length)(\s*\(.*\))?$/i,
  areaSqft: /^(क्षेत्रफल|area)(\s*\(.*\))?$/i,
  east: /^(पूर्व|east)$/i,
  west: /^(पश्चिम|west)$/i,
  north: /^(उत्तर|north)$/i,
  south: /^(दक्षिण|south)$/i,
  corner: /^(कॉर्नर|कोर्नर|कोना|corner)(\s*\(.*\))?$/i,
  floor: /^(तल|मंजिल|मंज़िल|floor)$/i,
};
const num = (s: string | undefined) => {
  const v = (s ?? "").replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).replace(/[^\d.]/g, "");
  return v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
};

/** Header row → plot rows; errors per row (Hindi). */
export function parsePlots(rows: string[][]): { plots: (PlotRow & { row: number })[]; errors: { row: number; reason: string }[] } {
  const errors: { row: number; reason: string }[] = [];
  if (!rows.length) return { plots: [], errors: [{ row: 1, reason: "फ़ाइल खाली है।" }] };
  const head = rows[0]!.map((h) => h.trim());
  const col = {} as Record<keyof PlotRow, number>;
  for (const k of Object.keys(HEADERS) as (keyof PlotRow)[]) col[k] = head.findIndex((h) => HEADERS[k].test(h));
  // Shop / unit projects may have no "ब्लॉक" column ("यूनिट" / "दुकान" in the plot column).
  if (col.plotNo < 0) col.plotNo = head.findIndex((h) => /^(यूनिट|दुकान|unit|shop)\s*(क्रमांक|नं\.?|नंबर|no\.?)?$/i.test(h));
  if (col.plotNo < 0) return { plots: [], errors: [{ row: 1, reason: 'पहली पंक्ति में "ब्लॉक" और "प्लाट क्रमांक" (या "यूनिट क्रमांक") कॉलम चाहिए।' }] };
  const plots: (PlotRow & { row: number })[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    const get = (k: keyof PlotRow) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    const block = get("block").toUpperCase();
    const plotNo = col.block < 0 ? get("plotNo").replace(/\s+/g, "").toUpperCase() : get("plotNo");
    if ((col.block >= 0 && !block) || !plotNo) return errors.push({ row, reason: "ब्लॉक या प्लाट क्रमांक खाली है।" });
    const key = `${block}|${plotNo}`;
    if (seen.has(key)) return errors.push({ row, reason: `ब्लॉक ${block} प्लाट ${plotNo} दो बार है।` });
    seen.add(key);
    plots.push({
      row,
      block,
      plotNo,
      ewFt: num(get("ewFt")),
      nsFt: num(get("nsFt")),
      areaSqft: num(get("areaSqft")),
      east: get("east") || null,
      west: get("west") || null,
      north: get("north") || null,
      south: get("south") || null,
      corner: /^(हाँ|हां|हा|yes|y|1|true|कॉर्नर|corner)$/i.test(get("corner")),
      floor: get("floor") || null,
    });
  });
  return { plots, errors };
}

// ---------- company mode (WhatsApp) ----------
/** "TF-16" / "दुकान TF 16" → the unit number of a SHOP project. */
export function parseUnitRef(text: string): string | null {
  const s = text.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  const m = s.match(/(?:दुकान|शॉप|shop|यूनिट|unit)?\s*(?:क्रमांक|नं\.?|no\.?)?\s*\b([A-Za-z]{1,3})\s*-?\s*(\d{1,4}[A-Za-z]?)\b/i);
  return m ? `${m[1]!.toUpperCase()}-${m[2]!.toUpperCase()}` : null;
}

/** "E-47" / "ब्लॉक E प्लाट 47" → { block, plotNo }. */
export function parsePlotRef(text: string): { block: string; plotNo: string } | null {
  const s = text.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  const m = s.match(/(?:ब्लॉक|ब्लाक|block)?\s*([A-Za-z])\s*[-/ ]\s*(?:प्लाट|प्लॉट|plot)?\s*(\d{1,4}[A-Za-z]?)/i);
  return m ? { block: m[1]!.toUpperCase(), plotNo: m[2]! } : null;
}

/**
 * Company's sale message:
 *   बिक्री E-47
 *   क्रेता: श्याम पुत्र श्री मोहन
 *   पता: ...   मोबाइल: ...   राशि: 1500000   भागीदार: महेश
 * → the fields (Aadhaar is taken on the web form, never over chat).
 */
export function parseCompanySale(text: string): {
  plot: { block: string; plotNo: string } | null;
  buyer: { name: string; relation: "पुत्र" | "पुत्री" | "पत्नी"; guardian: string } | null;
  address: string;
  mobile: string;
  amount: number | null;
  partner: string;
} | null {
  const lines = text.split(/\n/).map((l) => l.trim());
  if (!/^(बिक्री|बिक्रि|sale|bikri)(?=\s|$)/i.test(lines[0] ?? "")) return null;
  const field = (re: RegExp) => lines.find((l) => re.test(l))?.replace(re, "").replace(/^\s*[:：-]\s*/, "").trim() ?? "";
  const who = field(/^(क्रेता|खरीदार|buyer|kreta)/i);
  const rel = who.match(/^(.*?)\s+(पुत्र|पुत्री|पत्नी)\s+(?:श्री|स्व\.?)?\s*(.+)$/);
  const amt = field(/^(राशि|प्रतिफल|amount|rashi)/i).replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  const lakh = amt.match(/([\d.]+)\s*(लाख|lakh)/i);
  const amount = lakh ? Math.round(Number(lakh[1]) * 100_000) : Number(amt.replace(/[^\d]/g, "")) || null;
  return {
    plot: parsePlotRef(lines[0]!.replace(/^(बिक्री|बिक्रि|sale|bikri)\s*/i, "")),
    buyer: rel ? { name: rel[1]!.replace(/^(श्री|श्रीमती|सुश्री)\s*/, "").trim(), relation: rel[2] as "पुत्र", guardian: rel[3]!.trim() } : null,
    address: field(/^(पता|address|pata)/i),
    mobile: field(/^(मोबाइल|mobile|फोन)/i).replace(/\D/g, "").slice(-10),
    amount,
    partner: field(/^(भागीदार|partner)/i),
  };
}
