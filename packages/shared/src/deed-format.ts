/**
 * Party and property text in the office's own drafting style, as measured over
 * all 8,567 archived deeds (docs/nsk-deed-drafting-pattern.md). Used by the
 * WhatsApp bot and the office page's prefill; never invents boundaries,
 * khasra or amounts -- unknown parts become blanks ("____") for staff.
 */

export type Relation = "पुत्र" | "पुत्री" | "पत्नी";

// ---------- what is collected vs. what is printed ----------
// Two separate things, on purpose:
//  1. SAMPADA_REQUIRED_PARTY_FIELDS -- what the SAMPADA 2.0 portal needs to
//     create a party's ID. Always collected for EVERY party (buyer, mortgagor,
//     witnesses ...), whether or not the deed text prints it.
//  2. What the deed text prints -- the office's measured style (archive %,
//     docs/nsk-deed-drafting-pattern.md), e.g. mother's name only where that
//     deed type's office format uses it (DEED_TEXT_PRINTS_MOTHER_NAME).

export type PartyField = "name" | "guardian" | "motherName" | "aadhaar" | "mobile" | "email" | "address";

/** Owner's rule: never optional, for every party. */
export const SAMPADA_REQUIRED_PARTY_FIELDS: readonly PartyField[] = [
  "name",
  "guardian", // पिता/पति का नाम
  "motherName",
  "aadhaar",
  "mobile",
  "email",
  "address",
];

export const PARTY_FIELD_LABEL: Record<PartyField, string> = {
  name: "नाम",
  guardian: "पिता/पति का नाम",
  motherName: "माता का नाम",
  aadhaar: "आधार",
  mobile: "मोबाइल",
  email: "ईमेल",
  address: "पता",
};

/**
 * Whether a deed type's office format prints the mother's name in the party
 * text. The measured pattern has no deed type that does, so all are off; turn
 * one on here when the office uses it for that deed type.
 */
export const DEED_TEXT_PRINTS_MOTHER_NAME: Record<string, boolean> = {};

export interface PartyText {
  name: string | null;
  relation: Relation | null;
  /** Father's (पुत्र/पुत्री) or husband's (पत्नी) name. */
  guardian: string | null;
  /** Always collected (SAMPADA); printed only with opts.withMother. */
  motherName?: string | null;
  /** Full or masked Aadhaar ("XXXX1234"); null → blank for staff. */
  aadhaar?: string | null;
  pan?: string | null;
}

export const BLANK = "____";

const HONORIFIC_RE = /^\s*(स्व\.?\s*)?(श्री\s*मती|श्रीमती|श्रीमति|श्री|सुश्री|कुमारी|कु\.|डॉ\.?|डाॅ\.?|shri|smt\.?|mr\.?|mrs\.?|ms\.?)\s*/i;
/** "X पुत्र श्री Y", "X पत्नी स्व. श्री Y", "X S/o Y", "X w/o Y" ... */
const RELATION_RE =
  /^(.*?)\s+(पुत्र|पुत्री|पत्नी|s\/o|d\/o|w\/o|son of|daughter of|wife of)\s+(.+)$/i;
const REL_MAP: Record<string, Relation> = {
  पुत्र: "पुत्र",
  पुत्री: "पुत्री",
  पत्नी: "पत्नी",
  "s/o": "पुत्र",
  "son of": "पुत्र",
  "d/o": "पुत्री",
  "daughter of": "पुत्री",
  "w/o": "पत्नी",
  "wife of": "पत्नी",
};

/** Name without its leading honorific ("श्री राम" → "राम"). */
export function stripHonorific(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 2 && HONORIFIC_RE.test(out); i++) out = out.replace(HONORIFIC_RE, "");
  return out.trim();
}

/**
 * If the customer typed the relation inside the name ("अमित शर्मा पुत्र श्री
 * राजेश कुमार शर्मा"), split it: name = अमित शर्मा, relation = पुत्र,
 * guardian = राजेश कुमार शर्मा. Otherwise null.
 */
export function splitNameRelation(input: string): { name: string; relation: Relation; guardian: string } | null {
  const m = input.trim().replace(/\s+/g, " ").match(RELATION_RE);
  if (!m) return null;
  const name = stripHonorific(m[1]!);
  const guardian = stripHonorific(m[3]!);
  const relation = REL_MAP[m[2]!.toLowerCase()];
  if (!name || !guardian || !relation) return null;
  return { name, relation, guardian };
}

/** Relation from a menu answer: 1/पुत्र/बेटा → पुत्र, 2/पुत्री/बेटी → पुत्री, 3/पत्नी → पत्नी. */
export function parseRelation(input: string): Relation | null {
  const s = input.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).trim().toLowerCase();
  if (/^1\b|^पुत्र$|^बेटा$|^son$|^s\/o$/.test(s)) return "पुत्र";
  if (/^2\b|^पुत्री$|^बेटी$|^daughter$|^d\/o$/.test(s)) return "पुत्री";
  if (/^3\b|^पत्नी$|^wife$|^w\/o$/.test(s)) return "पत्नी";
  return null;
}

/**
 * Office honorific for the person. पुत्र → श्री, पत्नी → श्रीमती (the two forms
 * in the pattern). पुत्री is not in the measured pattern; "सुश्री" is used and
 * is easy for staff to change.
 */
export function honorificFor(relation: Relation | null): string {
  return relation === "पत्नी" ? "श्रीमती" : relation === "पुत्री" ? "सुश्री" : "श्री";
}

/** "123456789012" → "1234 5678 9012"; "XXXX1234" → "XXXX XXXX 1234"; missing → blank. */
export function formatAadhaar(a: string | null | undefined): string {
  if (!a) return `${BLANK} ${BLANK} ${BLANK}`;
  const digits = a.replace(/\s+/g, "");
  if (/^\d{12}$/.test(digits)) return digits.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
  const m = digits.match(/^X{4,}(\d{4})$/i);
  return m ? `XXXX XXXX ${m[1]}` : a;
}

/**
 * One party in the office form:
 * "श्री [नाम] पुत्र श्री [पिता] (आधार नं. XXXX XXXX XXXX) (पेन नं. ...)".
 */
export function formatParty(p: PartyText, opts: { withAadhaar?: boolean; withMother?: boolean } = {}): string {
  const name = p.name?.trim() ? stripHonorific(p.name) : BLANK;
  const parts = [`${honorificFor(p.relation)} ${name}`];
  if (p.guardian?.trim()) parts.push(`${p.relation ?? "पुत्र"} श्री ${stripHonorific(p.guardian)}`);
  else parts.push(`${p.relation ?? "पुत्र"} श्री ${BLANK}`);
  // Only for deed types whose office format prints it (DEED_TEXT_PRINTS_MOTHER_NAME).
  if (opts.withMother) parts.push(`माता श्रीमती ${p.motherName?.trim() ? stripHonorific(p.motherName) : BLANK}`);
  let text = parts.join(" ");
  if (opts.withAadhaar !== false) text += ` (आधार नं. ${formatAadhaar(p.aadhaar)})`;
  if (p.pan) text += ` (पेन नं. ${p.pan})`;
  return text;
}

/**
 * Which SAMPADA-required fields a party is still missing (empty strings count
 * as missing). Used before submitting and on the office page.
 */
export function missingSampadaFields(p: Partial<Record<PartyField, string | null | undefined>>): PartyField[] {
  return SAMPADA_REQUIRED_PARTY_FIELDS.filter((f) => !String(p[f] ?? "").trim());
}

/**
 * A party block: "विक्रेता पक्ष - श्री ..." (one person) or numbered lines for several.
 */
export function formatPartyBlock(heading: string, parties: string[]): string {
  if (parties.length <= 1) return `${heading} - ${parties[0] ?? BLANK}`;
  return `${heading} -\n${parties.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
}

const SQM_PER_SQFT = 0.09290304;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => String(round2(n));

/** Unit of a plot area as written in a deed; null when it isn't sqft/sqm. */
export function plotUnit(unit: string | null | undefined): "sqft" | "sqm" | null {
  const s = String(unit ?? "").toLowerCase().replace(/\s+/g, "");
  if (/वर्गफ|फीट|फुट|sq\.?f|sqft|squarefe|squarefo/.test(s)) return "sqft";
  if (/वर्गमी|मीटर|sq\.?m|sqm|squaremet|squaremt/.test(s)) return "sqm";
  return null;
}

/**
 * Plot area in both units like the office writes it:
 * "क्षेत्रफल - ____ फुट x ____ फुट होकर 1500 वर्गफुट यानी 139.35 वर्गमीटर है".
 * Side lengths are not in a registry summary → blanks. Null when the unit is unknown.
 */
export function plotAreaText(value: number | null | undefined, unit: string | null | undefined): string | null {
  const u = plotUnit(unit);
  if (!u || !(typeof value === "number" && value > 0)) return null;
  const sqft = u === "sqft" ? value : value / SQM_PER_SQFT;
  const sqm = u === "sqm" ? value : value * SQM_PER_SQFT;
  return `क्षेत्रफल - ${BLANK} फुट x ${BLANK} फुट होकर ${num(sqft)} वर्गफुट यानी ${num(sqm)} वर्गमीटर है`;
}

/** Short "1500 वर्गफुट यानी 139.35 वर्गमीटर" for chat messages; null when not sqft/sqm. */
export function plotAreaShort(value: number | null | undefined, unit: string | null | undefined): string | null {
  const u = plotUnit(unit);
  if (!u || !(typeof value === "number" && value > 0)) return null;
  const sqft = u === "sqft" ? value : value / SQM_PER_SQFT;
  const sqm = u === "sqm" ? value : value * SQM_PER_SQFT;
  return `${num(sqft)} वर्गफुट यानी ${num(sqm)} वर्गमीटर`;
}

export interface PropertyText {
  propertyType: string | null;
  khasraOrPlotNo: string | null;
  village: string | null;
  locality: string | null;
  tehsil: string | null;
  district: string | null;
  areaValue: number | null;
  areaUnit: string | null;
}

/**
 * The property part in the office style. Boundaries are never invented: the
 * "चतुःसीमा" lines are left blank for staff. `heading` defaults to the sale-deed
 * wording from the pattern ("विक्रीत सम्पत्ति का विवरण" / "विक्रीत की गयी कृषि
 * भूमि का विवरण निम्नानुसार है"); other deeds pass their own.
 */
export function formatPropertyBlock(p: PropertyText, heading?: string): string {
  const rest = [p.tehsil, p.district].filter(Boolean).join(", ");
  const lines: string[] = [];
  if (p.propertyType === "agricultural") {
    lines.push(heading ?? "विक्रीत की गयी कृषि भूमि का विवरण निम्नानुसार है -");
    lines.push(`सर्वे क्रमांक - ${p.khasraOrPlotNo || BLANK} ग्राम ${p.village || p.locality || BLANK}${rest ? `, ${rest}` : ""}`);
    lines.push(`क्षेत्रफल - ${p.areaValue ?? BLANK} ${p.areaUnit ?? ""}`.trim());
  } else {
    const place = [p.locality, p.village, p.tehsil, p.district].filter(Boolean).join(", ") || BLANK;
    lines.push(heading ?? "विक्रीत सम्पत्ति का विवरण -");
    lines.push(`प्लाट क्रमांक - ${p.khasraOrPlotNo || BLANK}, ${place}`);
    lines.push(plotAreaText(p.areaValue, p.areaUnit) ?? `क्षेत्रफल - ${p.areaValue ?? BLANK} ${p.areaUnit ?? ""}`.trim());
  }
  lines.push("जिसकी चतुःसीमा निम्न प्रकार है -");
  lines.push(`पूर्व - ${BLANK}`, `पश्चिम - ${BLANK}`, `उत्तर - ${BLANK}`, `दक्षिण - ${BLANK}`);
  return lines.join("\n");
}
