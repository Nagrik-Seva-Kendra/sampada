/**
 * Faithful port of the office's own guideline calculator
 * ("MP_Guideline_Calculator_2026-27.html", function calc()).
 *
 * Every formula, constant and rounding step below mirrors that file. Behaviour is
 * locked by golden tests (calculator.spec.ts) whose expected values were produced
 * by running the original HTML calculator. If the office changes the calculator,
 * change it here and regenerate the golden values — never "improve" a formula here.
 */
import { GWALIOR_2026_27_RAW, type GuidelineRow } from "./gwalior-2026-27.data.js";

export interface GuidelineEntry {
  sno: number;
  hi: string;
  en: string;
  ward: string;
  teh: string;
  pr: number; // भूखण्ड आवासीय / sqm
  pc: number; // भूखण्ड व्यावसायिक / sqm
  pi: number; // भूखण्ड औद्योगिक / sqm
  brt: number;
  bbt: number;
  btt: number;
  ktt: number;
  shop: number;
  office: number;
  godown: number;
  multi_res: number;
  multi_com: number;
  agri_irr: number; // per hectare
  agri_unirr: number; // per hectare
  subcl_res: number;
  subcl_com: number;
}

const toEntry = (r: GuidelineRow): GuidelineEntry => {
  const n = r as unknown as (string | number)[];
  const num = (i: number) => Number(n[i]) || 0;
  return {
    sno: num(0),
    hi: String(n[1] ?? ""),
    en: String(n[2] ?? ""),
    ward: String(n[3] ?? ""),
    teh: String(n[4] ?? ""),
    pr: num(5), pc: num(6), pi: num(7),
    brt: num(8), bbt: num(9), btt: num(10), ktt: num(11),
    shop: num(12), office: num(13), godown: num(14),
    multi_res: num(15), multi_com: num(16),
    agri_irr: num(17), agri_unirr: num(18),
    subcl_res: num(19), subcl_com: num(20),
  };
};

/** Same filter as the calculator: DATA = RAW.filter(r => r[0] && r[5] >= 500) */
export const GUIDELINE_DATA: GuidelineEntry[] = GWALIOR_2026_27_RAW.filter(
  (r) => r[0] && Number((r as unknown as number[])[5]) >= 500,
).map(toEntry);

// ---------------------------------------------------------------- units
/** Sampada's own factor (verified by the office against sampada.mpigr.gov.in). */
export const SQFT_TO_SQM = 0.092903;

export type AreaUnit = "sqm" | "sqft" | "hect" | "acre" | "bigha_p" | "bigha_k";

/** Plot/flat inputs: sqft is converted and rounded to 6 decimals (calculator toSqm()). */
export function plotAreaToSqm(value: number, unit: "sqm" | "sqft"): number {
  if (unit === "sqft") return Math.round(value * SQFT_TO_SQM * 1e6) / 1e6;
  return value;
}

/** Agricultural inputs (calculator agri section — plain multiplication, no rounding). */
export function agriAreaToSqm(value: number, unit: Exclude<AreaUnit, "sqft">): number {
  if (unit === "hect") return value * 10000;
  if (unit === "acre") return value * 4046.86;
  if (unit === "bigha_p") return value * 2529.0;
  if (unit === "bigha_k") return value * 843.0;
  return value;
}

// ---------------------------------------------------------------- search helpers
export function normalizeHindiSpelling(s: string): string {
  let t = s.normalize ? s.normalize("NFC") : s;
  t = t.replace(/[\u200B-\u200F\uFEFF]/g, "");
  t = t.replace(/औ/g, "ओ");
  t = t
    .replace(/ड़/g, "ड").replace(/ढ़/g, "ढ").replace(/फ़/g, "फ")
    .replace(/ज़/g, "ज").replace(/ऩ/g, "न").replace(/ऱ/g, "र").replace(/य़/g, "य");
  return t;
}

// ---------------------------------------------------------------- zone
export type ZoneType = "nigam1" | "nigam2" | "nagar" | "parishad" | "gramin";
const NIGAM_TEHSILS = ["gird", "murar", "citycenter", "gwalior"];

/** calculator detectZoneType(); null = undetermined. */
export function detectZoneType(d: GuidelineEntry): ZoneType | null {
  const ward = String(d.ward ?? "").trim().toUpperCase();
  const teh = String(d.teh ?? "").trim().toLowerCase();
  if (ward === "PLANNING AREA") return "nagar";
  if (ward === "NON-PLANNING AREA") return "gramin";
  if (/^\d+$/.test(ward)) return NIGAM_TEHSILS.includes(teh) ? "nigam1" : "parishad";
  return null;
}

/** calculator stamp-duty block: isNigam = numeric ward of up to 3 chars. */
export function isNigamArea(d: GuidelineEntry): boolean {
  if (!d.ward) return false;
  const wardNum = parseInt(d.ward, 10);
  return !isNaN(wardNum) && wardNum > 0 && d.ward.length <= 3;
}

// ---------------------------------------------------------------- plot
export interface PlotInput {
  entry: GuidelineEntry;
  areaSqm: number;
  use: "res" | "com" | "ind";
  roadPct?: number;
  corner?: boolean;
  foundation?: boolean;
}
export function plotValue(p: PlotInput) {
  const baseR = p.use === "res" ? p.entry.pr : p.use === "com" ? p.entry.pc : p.entry.pi;
  const rMul = 1 + (p.roadPct ?? 0) / 100;
  const cMul = p.corner && p.foundation ? 1.2 : p.corner || p.foundation ? 1.1 : 1.0;
  const rate = baseR * rMul * cMul;
  return { baseRate: baseR, rate, value: rate * p.areaSqm };
}

// ---------------------------------------------------------------- agriculture
interface Slab { from: number; to: number; pct: number }
function slabsFor(zone: ZoneType): { threshold: number; slabs: Slab[] } {
  if (zone === "nigam1")
    return { threshold: 1000, slabs: [{ from: 0, to: 400, pct: 1 }, { from: 400, to: 700, pct: 0.8 }, { from: 700, to: 1000, pct: 0.6 }] };
  if (zone === "nigam2" || zone === "nagar")
    return { threshold: 500, slabs: [{ from: 0, to: 200, pct: 1 }, { from: 200, to: 350, pct: 0.8 }, { from: 350, to: 500, pct: 0.6 }] };
  if (zone === "parishad")
    return { threshold: 300, slabs: [{ from: 0, to: 120, pct: 1 }, { from: 120, to: 210, pct: 0.8 }, { from: 210, to: 300, pct: 0.6 }] };
  return { threshold: 0, slabs: [] };
}

/** The zone's plot-rate part of agricultural land, in sqm, for one seller and one buyer (0 = none). */
export const zoneThreshold = (zone: ZoneType): number => slabsFor(zone).threshold;

export interface BreakdownLine {
  kind: "plot" | "agri" | "agri15";
  sqm: number;
  hect?: number;
  rate: number; // per sqm for plot, per hectare for agri
  value: number;
  pct?: number;
}

export interface AgriInput {
  entry: GuidelineEntry;
  areaSqm: number;
  irrigated: boolean;
  zone: ZoneType;
  roadPct?: number;
  sellers?: number; // separate-khata sellers
  buyers?: number; // non-family buyers
}
/** Undiverted agricultural land (calculator: isDiv === false). */
export function agriValue(a: AgriInput) {
  const roadMul = 1 + (a.roadPct ?? 0) / 100;
  const perHect = (a.irrigated ? a.entry.agri_irr || 0 : a.entry.agri_unirr || 0) * roadMul;
  const plotR = a.entry.pr * roadMul;
  const partyMul = Math.max(Math.max(1, a.sellers ?? 1), Math.max(1, a.buyers ?? 1));
  const base = slabsFor(a.zone);
  const threshold = base.threshold * partyMul;
  const slabs = base.slabs.map((s) => ({ from: s.from * partyMul, to: s.to * partyMul, pct: s.pct }));
  const areaHect = a.areaSqm / 10000;
  const graminSmallPlot = a.zone === "gramin" && areaHect <= 0.03;

  let total = 0;
  const lines: BreakdownLine[] = [];
  const plotPortion = Math.min(a.areaSqm, threshold);
  const agriPortion = Math.max(0, a.areaSqm - threshold);
  const agriPortionH = agriPortion / 10000;

  if (graminSmallPlot) {
    const v = a.areaSqm * plotR;
    total = v;
    lines.push({ kind: "plot", sqm: a.areaSqm, rate: plotR, value: v, pct: 1 });
  } else if (threshold > 0 && slabs.length > 0) {
    for (const s of slabs) {
      const portion = Math.min(Math.max(0, plotPortion - s.from), s.to - s.from);
      if (portion > 0) {
        const rate = plotR * s.pct;
        const v = portion * rate;
        total += v;
        lines.push({ kind: "plot", sqm: portion, rate, value: v, pct: s.pct });
      }
    }
    if (agriPortion > 0) {
      const v = agriPortionH * perHect;
      total += v;
      lines.push({ kind: "agri", sqm: agriPortion, hect: agriPortionH, rate: perHect, value: v });
    }
  } else {
    const v = areaHect * perHect;
    total = v;
    lines.push({ kind: "agri", sqm: a.areaSqm, hect: areaHect, rate: perHect, value: v });
  }
  return { total, lines, threshold, partyMul };
}

export interface DivertedInput {
  entry: GuidelineEntry;
  areaSqm: number;
  use: "res" | "com" | "ind";
  zone: ZoneType;
  roadPct?: number;
  sellers?: number;
  buyers?: number;
}
/** Diverted agricultural land (calculator: isDiv === true). */
export function divertedValue(d: DivertedInput) {
  const baseDiv = d.use === "com" ? d.entry.pc || 0 : d.use === "ind" ? d.entry.pi || 0 : d.entry.pr || 0;
  const roadMul = 1 + (d.roadPct ?? 0) / 100;
  const plotR = baseDiv * roadMul;
  const partyMul = Math.max(Math.max(1, d.sellers ?? 1), Math.max(1, d.buyers ?? 1));
  const base = slabsFor(d.zone);
  const threshold = base.threshold * partyMul;
  const slabs = base.slabs.map((s) => ({ from: s.from * partyMul, to: s.to * partyMul, pct: s.pct }));

  let total = 0;
  const lines: BreakdownLine[] = [];
  const plotPortion = Math.min(d.areaSqm, threshold > 0 ? threshold : d.areaSqm);
  const excess = Math.max(0, d.areaSqm - threshold);
  if (threshold > 0 && slabs.length > 0) {
    for (const s of slabs) {
      const portion = Math.min(Math.max(0, plotPortion - s.from), s.to - s.from);
      if (portion > 0) {
        const rate = plotR * s.pct;
        const v = portion * rate;
        total += v;
        lines.push({ kind: "plot", sqm: portion, rate, value: v, pct: s.pct });
      }
    }
    if (excess > 0) {
      const hect = excess / 10000;
      const rate15 = (d.entry.agri_irr || 0) * roadMul * 1.5;
      const v = hect * rate15;
      total += v;
      lines.push({ kind: "agri15", sqm: excess, hect, rate: rate15, value: v });
    }
  } else {
    const v = d.areaSqm * plotR;
    total = v;
    lines.push({ kind: "plot", sqm: d.areaSqm, rate: plotR, value: v, pct: 1 });
  }
  return { total, lines, threshold, partyMul, baseRate: baseDiv };
}

// ---------------------------------------------------------------- flat
export function flatValue(f: {
  entry: GuidelineEntry;
  areaSqm: number;
  commercial: boolean;
  floorIdx?: number; // residential: 0..3 (3 = third and above)
  lift?: boolean;
  commercialFloorFactor?: number; // commercial: value of the calculator's flatFloorCom select
}) {
  let baseR: number;
  let ff: number;
  if (!f.commercial) {
    baseR = f.entry.multi_res && f.entry.multi_res > 0 ? f.entry.multi_res : f.entry.brt;
    ff = f.lift ? 1.0 : [1.0, 0.95, 0.9, 0.85][Math.min(3, Math.max(0, f.floorIdx ?? 0))]!;
  } else {
    baseR = f.entry.multi_com && f.entry.multi_com > 0 ? f.entry.multi_com : 0;
    ff = f.commercialFloorFactor ?? 1;
  }
  const rate = baseR * ff;
  return { baseRate: baseR, floorFactor: ff, rate, value: rate * f.areaSqm };
}

// ---------------------------------------------------------------- stamp duty
/**
 * calculator stamp-duty block (MP 2026-27, as coded in the office calculator):
 * nigam: SD 9.5%; otherwise 6.5%. Registration: male 3%, female 1%.
 * Joint (male+female) = male calculation. Consideration above guideline value adds
 * extra duty on the excess: nigam 5.1%, otherwise 2.1%.
 */
export function stampDuty(total: number, entry: GuidelineEntry, consideration = 0) {
  const isNigam = isNigamArea(entry);
  const excessAmt = consideration > total ? consideration - total : 0;
  const excessPct = isNigam ? 0.051 : 0.021;
  const excessDuty = Math.round(excessAmt * excessPct);
  const sdPct = isNigam ? 0.095 : 0.065;
  const sd = Math.round(total * sdPct) + excessDuty;
  const regMale = Math.round(total * 0.03);
  const regFemale = Math.round(total * 0.01);
  return {
    isNigam,
    sdPct,
    excessAmt,
    excessDuty,
    male: { stampDuty: sd, registration: regMale, total: sd + regMale },
    female: { stampDuty: sd, registration: regFemale, total: sd + regFemale },
    joint: { stampDuty: sd, registration: regMale, total: sd + regMale },
  };
}

/** Rounding used by the calculator for every displayed rupee amount. */
export const rupees = (n: number) => Math.round(n);
