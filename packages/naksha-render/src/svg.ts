import type { DeedPropertyDetailCreateInput } from "@sampada/shared";
import { computeAreas } from "./areas.js";
import { escapeXml } from "./xml.js";

export type NakshaLang = "hi" | "en";

/** Buyer/seller names shown on the naksha, read from the deed's own text (its "विक्रेता पक्ष"/"क्रेता पक्ष" lines). */
export interface NakshaParties {
  sellerName?: string;
  buyerName?: string;
}

const FONT_STACK = "'Noto Sans Devanagari','Nirmala UI','Mangal',sans-serif";
// A4 width in CSS px at 96dpi (same convention as apps/web's deedPdf.ts), so
// the on-screen preview and the exported PDF page are both A4-proportioned.
const WIDTH = 794;
const MARGIN_X = 60;
const DRAW_WIDTH = 280; // horizontal extent of the drawn rectangle = N-S measurement
const DRAW_HEIGHT = 340; // vertical extent of the drawn rectangle = E-W measurement
const RIGHT_MARGIN_W = 190; // room for the vertical dimension + south column
const LEFT_MARGIN_W = 190; // room for the north column

const UNIT_LABEL: Record<NakshaLang, Record<"ft" | "m", string>> = {
  hi: { ft: "फुट", m: "मीटर" },
  en: { ft: "ft", m: "m" },
};

const AREA_UNIT_LABEL: Record<NakshaLang, { sqft: string; sqm: string }> = {
  hi: { sqft: "वर्गफुट", sqm: "वर्गमीटर" },
  en: { sqft: "sq ft", sqm: "sq m" },
};

const SIDE_LABEL: Record<NakshaLang, { north: string; south: string; east: string; west: string }> = {
  hi: { north: "(उत्तर)", south: "(दक्षिण)", east: "(पूरब)", west: "(पश्चिम)" },
  en: { north: "(North)", south: "(South)", east: "(East)", west: "(West)" },
};

const FIELD_LABEL: Record<
  NakshaLang,
  { plotNo: string; block: string; area: string; ie: string; seller: string; buyer: string; sellerSign: string; buyerSign: string }
> = {
  hi: {
    plotNo: "प्लाट क्रमांक",
    block: "ब्लॉक",
    area: "क्षेत्रफल",
    ie: "यानि",
    seller: "विक्रेता पक्ष",
    buyer: "क्रेता पक्ष",
    sellerSign: "हस्ता.विक्रेता",
    buyerSign: "हस्ता.क्रेता",
  },
  en: {
    plotNo: "Plot No.",
    block: "Block",
    area: "Area",
    ie: "i.e.",
    seller: "Seller",
    buyer: "Buyer",
    sellerSign: "Seller's Signature",
    buyerSign: "Buyer's Signature",
  },
};

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Naive word-based wrap — approximates Devanagari width by character count, good enough for a print layout. */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Builds the header sentence, e.g. "नक्शा सम्पत्ति प्लाट स्थित <location> में स्थित है।". `location` is one free-text address block — the deed's own phrasing, not split into fields. */
function buildHeaderSentence(d: Pick<DeedPropertyDetailCreateInput, "location">, lang: NakshaLang): string {
  return lang === "hi"
    ? `नक्शा सम्पत्ति प्लाट स्थित ${d.location} में स्थित है।`
    : `Naksha of the property plot situated at ${d.location}.`;
}

/**
 * Builds the naksha (site-plan) SVG for a rectangle/square plot, matching
 * this office's standard hand-drawn naksha layout: a header sentence (the
 * property's full address, as one line), seller/buyer lines, the computed
 * area in sqft/sqm, an outlined rectangle labeled with the four chauhaddi
 * (East on top, North on left, South on right, West on bottom, matching the
 * road/frontage-at-bottom convention already in use), a single dimension
 * pair (vertical = E-W length, horizontal = N-S length), and a seller/buyer
 * signature line. Pure function of its inputs — same input always produces
 * byte-identical output. All user-supplied text is XML-escaped since
 * location/chauhaddi/party-name free text may contain `&`/`<`/etc.
 */
export function buildNakshaSvg(
  d: Pick<
    DeedPropertyDetailCreateInput,
    "plotNo" | "block" | "location" | "ewLength" | "nsLength" | "unit" | "boundaries"
  >,
  parties: NakshaParties,
  lang: NakshaLang,
): string {
  const unitLabel = UNIT_LABEL[lang][d.unit];
  const areaUnitLabel = AREA_UNIT_LABEL[lang];
  const side = SIDE_LABEL[lang];
  const field = FIELD_LABEL[lang];
  const areas = computeAreas(d);

  const rectW = DRAW_WIDTH;
  const rectH = DRAW_HEIGHT;
  const rectX = MARGIN_X + LEFT_MARGIN_W;
  const centerX = rectX + rectW / 2;

  const parts: string[] = [];
  let y = 30;
  const lineGap = 20;

  // Header font is smaller than the rest of the page (11 vs 13-14): this
  // line is a full postal address plus the fixed "नक्शा सम्पत्ति प्लाट
  // स्थित ... में स्थित है।" wrapper text, easily 100+ characters, and it
  // should read as one line rather than wrapping mid-address.
  const headerLines = wrapText(buildHeaderSentence(d, lang), 115);
  for (const line of headerLines) {
    parts.push(`<text x="${MARGIN_X}" y="${y}" font-size="11" fill="#111">${escapeXml(line)}</text>`);
    y += lineGap;
  }
  y += 10;

  if (parties.sellerName) {
    parts.push(
      `<text x="${MARGIN_X}" y="${y}" font-size="14" fill="#111">${escapeXml(field.seller)} – ${escapeXml(parties.sellerName)}</text>`,
    );
    y += lineGap;
  }
  if (parties.buyerName) {
    parts.push(
      `<text x="${MARGIN_X}" y="${y}" font-size="14" fill="#111">${escapeXml(field.buyer)} – ${escapeXml(parties.buyerName)}</text>`,
    );
    y += lineGap;
  }
  y += 10;

  parts.push(
    `<text x="${WIDTH - MARGIN_X}" y="${y}" font-size="14" text-anchor="end" fill="#111">${escapeXml(field.area)} – ${fmt(areas.sqft)} ${areaUnitLabel.sqft}</text>`,
  );
  y += lineGap;
  parts.push(
    `<text x="${WIDTH - MARGIN_X}" y="${y}" font-size="14" text-anchor="end" fill="#111">${escapeXml(field.ie)} – ${fmt(areas.sqm)} ${areaUnitLabel.sqm}</text>`,
  );
  y += lineGap + 20;

  // Top margin: direction label, then the East boundary text, directly above the rectangle.
  parts.push(`<text x="${centerX}" y="${y}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(side.east)}</text>`);
  y += lineGap;
  parts.push(
    `<text x="${centerX}" y="${y}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(d.boundaries.east)}</text>`,
  );
  y += 14;

  const rectY = y;
  parts.push(`<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="none" stroke="#111" stroke-width="2.5"/>`);

  // Rectangle center: this plot's own plot number (optional) and block (optional).
  const plotCenterY = rectY + rectH / 2;
  const hasPlotNo = !!d.plotNo;
  const hasBlock = !!d.block;
  if (hasPlotNo) {
    parts.push(
      `<text x="${centerX}" y="${plotCenterY - (hasBlock ? 8 : 0)}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(field.plotNo)} – ${escapeXml(d.plotNo!)}</text>`,
    );
  }
  if (hasBlock) {
    parts.push(
      `<text x="${centerX}" y="${hasPlotNo ? plotCenterY + 14 : plotCenterY}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(field.block)} – ${escapeXml(d.block!)}</text>`,
    );
  }

  // Left margin: North direction label + boundary text, centered in the left margin column —
  // same centering convention as East/West (which are centered above/below the rectangle).
  const leftColCenterX = MARGIN_X + LEFT_MARGIN_W / 2;
  parts.push(
    `<text x="${leftColCenterX}" y="${plotCenterY - 8}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(side.north)}</text>`,
  );
  parts.push(
    `<text x="${leftColCenterX}" y="${plotCenterY + 12}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(d.boundaries.north)}</text>`,
  );

  // Right margin: vertical dimension (E-W length) directly against the rectangle, drawn as a
  // double-headed arrow with the length on the line (matching this office's reference naksha
  // style), then the South direction label + boundary text centered further out.
  const dimX = rectX + rectW + 34;
  const arrow = 8;
  parts.push(`
    <line x1="${dimX}" y1="${rectY}" x2="${dimX}" y2="${rectY + rectH}" stroke="#111" stroke-width="1.75"/>
    <path d="M ${dimX} ${rectY} L ${dimX - arrow / 2} ${rectY + arrow} L ${dimX + arrow / 2} ${rectY + arrow} Z" fill="#111"/>
    <path d="M ${dimX} ${rectY + rectH} L ${dimX - arrow / 2} ${rectY + rectH - arrow} L ${dimX + arrow / 2} ${rectY + rectH - arrow} Z" fill="#111"/>
    <text x="${dimX}" y="${plotCenterY}" font-size="19" font-weight="bold" text-anchor="middle" fill="#111"
      transform="rotate(-90 ${dimX} ${plotCenterY})">${fmt(d.ewLength)} ${unitLabel}</text>`);

  const rightColCenterX = rectX + rectW + RIGHT_MARGIN_W / 2 + 20;
  parts.push(
    `<text x="${rightColCenterX}" y="${plotCenterY - 8}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(side.south)}</text>`,
  );
  parts.push(
    `<text x="${rightColCenterX}" y="${plotCenterY + 12}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(d.boundaries.south)}</text>`,
  );

  // Bottom margin: horizontal dimension (N-S length) against the rectangle, drawn as a
  // double-headed arrow with the length on the line (same convention as the vertical
  // dimension above), then the West boundary text, then the direction label at the outer edge.
  const dimY = rectY + rectH + 26;
  parts.push(`
    <line x1="${rectX}" y1="${dimY}" x2="${rectX + rectW}" y2="${dimY}" stroke="#111" stroke-width="1.75"/>
    <path d="M ${rectX} ${dimY} L ${rectX + arrow} ${dimY - arrow / 2} L ${rectX + arrow} ${dimY + arrow / 2} Z" fill="#111"/>
    <path d="M ${rectX + rectW} ${dimY} L ${rectX + rectW - arrow} ${dimY - arrow / 2} L ${rectX + rectW - arrow} ${dimY + arrow / 2} Z" fill="#111"/>
    <text x="${centerX}" y="${dimY - 6}" font-size="19" font-weight="bold" text-anchor="middle" fill="#111">${fmt(d.nsLength)} ${unitLabel}</text>`);
  let by = dimY + lineGap + 10;
  parts.push(
    `<text x="${centerX}" y="${by}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(d.boundaries.west)}</text>`,
  );
  by += lineGap;
  parts.push(`<text x="${centerX}" y="${by}" font-size="13" text-anchor="middle" fill="#111">${escapeXml(side.west)}</text>`);
  by += lineGap + 30;

  // Signature footer.
  parts.push(
    `<text x="${MARGIN_X + 40}" y="${by}" font-size="13" fill="#111">${escapeXml(field.sellerSign)}</text>`,
  );
  parts.push(
    `<text x="${WIDTH - MARGIN_X - 40}" y="${by}" font-size="13" text-anchor="end" fill="#111">${escapeXml(field.buyerSign)}</text>`,
  );
  by += 20;

  const height = by;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="${FONT_STACK}" font-weight="bold">
  <rect x="0" y="0" width="${WIDTH}" height="${height}" fill="#ffffff"/>
${parts.join("\n")}
</svg>`;
}
