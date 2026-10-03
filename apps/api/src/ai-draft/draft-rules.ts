import {
  type DeedType,
  formatParty,
  formatPartyBlock,
  formatPropertyBlock,
  numberToHindiRupees,
  splitNameRelation,
  type WaRequestDetail,
  type WaRevealResult,
} from "@sampada/shared";
import type { AiPropertyType } from "./archive-text.js";

/**
 * Pure drafting rules for "AI से पूरा ड्राफ्ट": the new request's facts (each
 * with its source), Aadhaar/PAN as tokens the model never sees, scenario flags,
 * the clause library, the prompt, and the checks run on the model's output.
 */

export type FactSource = "oldRegistry" | "customer" | "idCard" | "staff";
export const FACT_SOURCE_HI: Record<FactSource, string> = {
  oldRegistry: "पुरानी रजिस्ट्री (पढ़ी गई)",
  customer: "ग्राहक (WhatsApp)",
  idCard: "पहचान पत्र",
  staff: "स्टाफ",
};

export interface Fact {
  key: string;
  label: string;
  /** Value as it must appear in the deed (tokens for Aadhaar/PAN). */
  value: string;
  source: FactSource;
  /** Checked by the validator: must appear verbatim in the draft. */
  required: boolean;
}

export interface DraftInput {
  deedType: DeedType;
  propertyType: AiPropertyType;
  facts: Fact[];
  /** Party + property text in the office style, to be copied exactly. */
  blocks: string[];
  /** Token → real value; substituted on the server after the model answers. */
  tokens: Record<string, string>;
  flags: string[];
}

export const REQUEST_DEED_TYPE: Record<string, DeedType | null> = { sale: "sale-deed", mortgage: "equitable-mortgage-deed", other: null };

/** Standard clauses per deed type (from docs/nsk-deed-drafting-pattern.md and the archive): the draft must carry them. */
export const CLAUSE_LIBRARY: Partial<Record<DeedType, { must: string[]; hints: string[] }>> = {
  "sale-deed": {
    must: ["विक्रेता पक्ष", "क्रेता पक्ष", "जिसकी चतुःसीमा निम्न प्रकार है", "अब भविष्य में कुछ भी लेना देना शेष नहीं रहा है", "इति"],
    hints: [
      'शीर्षक "विक्रय पत्र"',
      "प्रतिफल की पूरी राशि अंकों और शब्दों में, भुगतान का विवरण",
      "कब्ज़ा सौंपने का वाक्य",
      "विक्रीत सम्पत्ति पर कोई बंधक/विवाद न होने का आश्वासन",
      'अंत में "अतएव यह विक्रय पत्र ... सनद् रहे व वक्त जरूरत काम आवें।" और "इति [शहर], दिनांक DD.MM.YYYY"',
    ],
  },
  "equitable-mortgage-deed": {
    must: ["बंधककर्ता", "गवाह", "इति"],
    hints: ['शीर्षक "बंधक पत्र" (Equitable Mortgage)', "बैंक/ऋणदाता का नाम और ऋण राशि जहाँ नहीं पता वहाँ ____", "मूल दस्तावेज़ बैंक के पास जमा करने का वाक्य"],
  },
};

const AGRI_MUST = ["सर्वे क्रमांक", "कृषि भूमि"];

/** Facts + blocks + tokens for a sale or mortgage request. Aadhaar/PAN never leave as numbers. */
export function draftInput(r: WaRequestDetail, secrets: WaRevealResult, propertyType: AiPropertyType): DraftInput | null {
  const deedType = REQUEST_DEED_TYPE[r.deedType];
  if (!deedType) return null;
  const facts: Fact[] = [];
  const tokens: Record<string, string> = {};
  const flags: string[] = [];
  let t = 0;
  const token = (kind: "AADHAAR" | "PAN", real: string | null): string | null => {
    if (!real) return null;
    const k = `[[${kind}_${++t}]]`;
    tokens[k] = kind === "AADHAAR" ? real.replace(/\D/g, "").replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3") : real;
    return k;
  };
  const add = (key: string, label: string, value: string | null | undefined, source: FactSource, required = true) => {
    const v = (value ?? "").toString().trim();
    if (v) facts.push({ key, label, value: v, source, required });
  };
  const fromCard = (party: string) => r.idCards.find((c) => c.party === party)?.aadhaarFromCard ?? false;
  const blocks: string[] = [];
  const reg = r.registry;
  const prop = reg?.property ?? null;

  if (deedType === "sale-deed") {
    const sellers = (reg?.currentOwners ?? []).map((o, i) => {
      const split = o.relation ? splitNameRelation(`${o.name} ${o.relation}`) : null;
      add(`seller${i + 1}`, `विक्रेता ${i + 1} का नाम`, split?.name ?? o.name, "oldRegistry");
      return formatParty(split ?? { name: o.name, relation: null, guardian: null });
    });
    if (sellers.length > 1) flags.push("एक से अधिक विक्रेता — सभी को क्रमांक से लिखें");
    const aad = token("AADHAAR", secrets.aadhaar);
    const pan = token("PAN", secrets.pan);
    add("buyerName", "क्रेता का नाम", r.buyer.name, "customer");
    add("buyerFather", r.buyer.relation === "पत्नी" ? "क्रेता के पति" : "क्रेता के पिता", r.buyer.fatherName, "customer");
    add("buyerAddress", "क्रेता का पता", r.buyer.address, "customer", false);
    if (aad) add("buyerAadhaar", "क्रेता का आधार", aad, fromCard("buyer") ? "idCard" : "customer");
    if (pan) add("buyerPan", "क्रेता का PAN", pan, fromCard("buyer") ? "idCard" : "customer");
    const buyer = formatParty({ name: r.buyer.name, relation: r.buyer.relation, guardian: r.buyer.fatherName, aadhaar: aad, pan });
    blocks.push(formatPartyBlock("विक्रेता पक्ष", sellers), formatPartyBlock("क्रेता पक्ष", [buyer]));
    if (r.buyer.relation === "पत्नी" || r.buyer.relation === "पुत्री") flags.push("क्रेता महिला है — पंजीयन शुल्क में छूट लागू हो सकती है (स्टाफ जाँचे)");
    if (r.amount != null) {
      add("amount", "प्रतिफल राशि", String(Math.round(r.amount)), "customer");
      add("amountWords", "प्रतिफल राशि (शब्दों में)", numberToHindiRupees(Math.round(r.amount)), "customer", false);
      if (r.amount >= 5_000_000) flags.push("राशि 50 लाख या अधिक — TDS (1%) का उल्लेख/जाँच");
    } else flags.push("प्रतिफल राशि तय नहीं — राशि की जगह ____ छोड़ें");
    if (r.plot?.corner) flags.push("कॉर्नर प्लॉट");
    if (r.plot?.hasBuilding) flags.push("प्लॉट पर निर्माण है");
  } else {
    const people = r.mortgage?.people ?? [];
    const texts = people.map((p, i) => {
      const aad = token("AADHAAR", secrets.people[i]?.aadhaar ?? null);
      add(`person${i}`, `${p.role} का नाम`, p.name, "customer");
      if (aad) add(`person${i}Aadhaar`, `${p.role} का आधार`, aad, "customer");
      return formatParty({ name: p.name, relation: p.relation, guardian: p.fatherName, aadhaar: aad });
    });
    const [mortgagor, ...witnesses] = texts;
    blocks.push(formatPartyBlock("बंधककर्ता", mortgagor ? [mortgagor] : []), formatPartyBlock("गवाह", witnesses));
    flags.push("बैंक का नाम और ऋण राशि ज्ञात नहीं — ____ छोड़ें");
  }

  if (prop) {
    add("khasra", propertyType === "agricultural" ? "सर्वे/खसरा क्रमांक" : "प्लाट क्रमांक", prop.khasraOrPlotNo, "oldRegistry");
    add("locality", "मोहल्ला/कॉलोनी", prop.locality, "oldRegistry", false);
    add("village", "ग्राम", prop.village, "oldRegistry", false);
    add("tehsil", "तहसील", prop.tehsil, "oldRegistry", false);
    add("district", "जिला", prop.district, "oldRegistry", false);
    if (prop.areaValue != null) add("area", "क्षेत्रफल", String(prop.areaValue), "oldRegistry");
    blocks.push(formatPropertyBlock(prop, deedType === "equitable-mortgage-deed" ? "बंधक सम्पत्ति का विवरण -" : undefined));
  } else flags.push("संपत्ति का विवरण पुरानी रजिस्ट्री से नहीं पढ़ा गया — ____ छोड़ें");
  if (propertyType === "agricultural") flags.push("कृषि भूमि — सर्वे क्रमांक, रकबा (हेक्टेयर), सिंचित/असिंचित जैसा पुरानी रजिस्ट्री में है");
  return { deedType, propertyType, facts, blocks, tokens, flags };
}

const DEED_TITLE: Partial<Record<DeedType, string>> = { "sale-deed": "विक्रय पत्र", "equitable-mortgage-deed": "बंधक पत्र" };

export const SYSTEM_PROMPT = `You draft property deeds for a document-writer office in Gwalior, Madhya Pradesh, in the office's own formal legal Hindi.
You get 2-3 of the office's own earlier deeds of the SAME deed type and property type, with all personal data masked ([नाम-1], [आधार], [राशि], [पता], [क्रमांक], [सीमा]).
They show the office's structure, clause order and wording. Never copy anything inside [ ] from them, and never take any fact from them.
Write the new deed ONLY from the FACTS and BLOCKS given:
- Copy every BLOCK exactly, character for character, including tokens like [[AADHAAR_1]] / [[PAN_1]] and blanks "____".
- Every fact value must appear exactly as given. Anything not given stays "____" for staff (boundaries, dates, bank, witnesses' details ...). Never invent names, numbers, boundaries or amounts.
- Devanagari Hindi only (English only inside names or tokens as given). Dates only as DD.MM.YYYY.
- Output plain text paragraphs separated by blank lines, ready to print: first line the deed title, no markdown, no notes before or after.`;

/** The user message: masked examples, then facts / blocks / required clauses / scenario flags. */
export function buildPrompt(input: DraftInput, examples: { title: string; text: string; reason: string }[], learned: string[] = []): string {
  const c = CLAUSE_LIBRARY[input.deedType];
  const parts = [
    ...examples.map((e, i) => `<example n="${i + 1}" why="${e.reason}">\n${e.text.slice(0, 14000)}\n</example>`),
    `Deed type: ${DEED_TITLE[input.deedType] ?? input.deedType}; property type: ${input.propertyType}.`,
    "FACTS (value — must appear exactly):",
    ...input.facts.map((f) => `- ${f.label}: ${f.value}`),
    "BLOCKS (copy exactly into the right places):",
    ...input.blocks.map((b) => `<block>\n${b}\n</block>`),
    ...(c ? ["Must contain these phrases:", ...c.must.map((m) => `- ${m}`), "Also follow:", ...c.hints.map((h) => `- ${h}`)] : []),
    ...(input.flags.length ? ["Points for this deed:", ...input.flags.map((f) => `- ${f}`)] : []),
    ...learned,
    "Write the complete deed now.",
  ];
  return parts.join("\n");
}

/** Replaces [[AADHAAR_n]] / [[PAN_n]] with the real values (server side, after the model). */
export function substituteTokens(text: string, tokens: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(tokens)) out = out.split(k).join(v);
  return out;
}

export interface Issue {
  code: string;
  /** Hindi message for staff -- no personal data. */
  message: string;
}

const devanagariShare = (s: string) => {
  const letters = s.match(/[A-Za-zऀ-ॿ]/g) ?? [];
  const dev = s.match(/[ऀ-ॿ]/g) ?? [];
  return letters.length ? dev.length / letters.length : 0;
};

/** Checks the model's text (before token substitution). Each issue blocks nothing by itself; staff review it. */
export function validateDraft(text: string, input: DraftInput): Issue[] {
  const issues: Issue[] = [];
  const flat = text.replace(/\s+/g, " ");
  const title = DEED_TITLE[input.deedType];
  if (title && !text.trim().split("\n")[0]!.includes(title)) issues.push({ code: "title", message: `पहली पंक्ति में शीर्षक "${title}" नहीं है।` });
  for (const b of input.blocks) {
    if (!flat.includes(b.replace(/\s+/g, " "))) issues.push({ code: "block", message: `यह हिस्सा ड्राफ्ट में हूबहू नहीं मिला: "${b.split("\n")[0]!.slice(0, 40)}…"` });
  }
  for (const f of input.facts.filter((x) => x.required)) {
    if (!flat.includes(f.value.replace(/\s+/g, " "))) issues.push({ code: "fact", message: `${f.label} ड्राफ्ट में नहीं मिला।` });
  }
  for (const m of CLAUSE_LIBRARY[input.deedType]?.must ?? []) {
    if (!flat.includes(m)) issues.push({ code: "clause", message: `ज़रूरी वाक्यांश नहीं मिला: "${m}"` });
  }
  if (input.propertyType === "agricultural") {
    for (const m of AGRI_MUST) if (!flat.includes(m)) issues.push({ code: "agri", message: `कृषि भूमि: "${m}" नहीं मिला।` });
  }
  const tokens = text.match(/\[\[[A-Z]+_\d+\]\]/g) ?? [];
  const unknown = tokens.filter((t) => !(t in input.tokens));
  if (unknown.length) issues.push({ code: "token", message: "ड्राफ्ट में अनजाना टोकन है।" });
  if (/\[(नाम|आधार|PAN|मोबाइल|ईमेल|पता|राशि|क्रमांक|सीमा)(-\d+)?\]/.test(text)) {
    issues.push({ code: "copiedMask", message: "पुरानी डीड का छुपाया गया हिस्सा ([नाम] आदि) ड्राफ्ट में आ गया।" });
  }
  if (/^\s*#|\*\*|```/m.test(text)) issues.push({ code: "markdown", message: "ड्राफ्ट में markdown चिह्न हैं।" });
  if (devanagariShare(text) < 0.85) issues.push({ code: "hindi", message: "ड्राफ्ट में हिंदी के अलावा बहुत ज़्यादा अंग्रेज़ी है।" });
  const badDates = (text.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(जनवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर)/g) ?? []).length;
  if (badDates) issues.push({ code: "date", message: "तारीख DD.MM.YYYY रूप में नहीं है।" });
  return issues;
}

/** USD per million tokens (input, output) for the cost line; unknown models → Opus 5.5 prices. */
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [3, 15],
  "claude-sonnet-5": [3, 15],
  "claude-haiku-4-5-20251001": [1, 5],
};
export function costUsd(model: string, inTok: number, outTok: number): number {
  const [i, o] = PRICE[model] ?? PRICE["claude-opus-5-5"]!;
  return Math.round(((inTok * i + outTok * o) / 1e6) * 10000) / 10000;
}

/** Strips anything the model put around the deed (``` fences, a leading note). */
export function cleanOutput(text: string): string {
  return text
    .replace(/^```[a-z]*\n?|```\s*$/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
