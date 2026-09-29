import { Injectable, Logger } from "@nestjs/common";
import type { DeedProperty } from "./deed-extractor.service.js";
import {
  GUIDELINE_DATA,
  type GuidelineEntry,
  type ZoneType,
  agriAreaToSqm,
  agriValue,
  detectZoneType,
  divertedValue,
  normalizeHindiSpelling,
  plotAreaToSqm,
  plotValue,
  stampDuty,
} from "./guideline/calculator.js";
import { GUIDELINE_YEAR } from "./guideline/gwalior-2026-27.data.js";

export interface GuidelineResult {
  year: string;
  sno: number;
  matchedLocality: string;
  method: "plot" | "agri" | "diverted";
  zone: ZoneType | null;
  // kept for backward compatibility with older callers
  ratePerUnit: number;
  unit: string;
  area: number;
  marketValue: number;
  /** Ready-to-send Hindi lines (breakdown + assumptions + stamp duty). */
  lines: string[];
  assumptions: string[];
  stamp: ReturnType<typeof stampDuty>;
}

const inr = (n: number) => Math.round(n).toLocaleString("en-IN");

/** Punctuation/space-insensitive exact comparison key (no fuzzy matching). */
export function locationKey(s: string): string {
  return normalizeHindiSpelling(String(s ?? ""))
    .toLowerCase()
    .replace(/[.,()\-–—/:;'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WARD_RE = /(?:वार्ड|ward)\s*(?:क्र(?:मांक)?\.?|no\.?|नं\.?)?\s*(\d{1,3})/i;

/** Parses the deed's locality/village text into candidate names + ward number. */
export function parseLocation(p: Pick<DeedProperty, "locality" | "village">): { ward: string | null; names: string[] } {
  const raw = [p.locality, p.village].filter(Boolean).join(",");
  const wm = raw.match(WARD_RE);
  const ward = wm ? wm[1]!.padStart(2, "0") : null;
  const names = raw
    .split(",")
    .map((s) => s.replace(WARD_RE, "").trim())
    .filter((s) => s.length > 1);
  return { ward, names: [...new Set(names)] };
}

/**
 * Exact match only: a name part must equal an entry's Hindi or English name
 * (after spelling/punctuation normalisation). If the ward is known it must match too.
 * More than one distinct entry → null (staff decides). Never guesses.
 */
export function matchEntry(p: Pick<DeedProperty, "locality" | "village">): GuidelineEntry | null {
  const { ward, names } = parseLocation(p);
  if (names.length === 0) return null;
  const keys = new Set(names.map(locationKey));
  let hits = GUIDELINE_DATA.filter((e) => keys.has(locationKey(e.hi)) || (e.en && keys.has(locationKey(e.en))));
  if (ward) hits = hits.filter((e) => /^\d+$/.test(e.ward.trim()) && e.ward.trim().padStart(2, "0") === ward);
  const unique = [...new Map(hits.map((e) => [e.sno, e])).values()];
  return unique.length === 1 ? unique[0]! : null;
}

type Unit = "sqm" | "sqft" | "hect" | "acre";
export function parseUnit(u: string | null): Unit | null {
  const s = String(u ?? "").toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (/बीघा|bigha/.test(s)) return null; // pakka/kachcha ambiguous → staff
  if (/हेक्टेयर|हे\.|hect|^ha$/.test(s)) return "hect";
  if (/वर्गफ|वर्गफीट|वर्गफुट|sq\.?f|sqft|squarefe|squarefo/.test(s)) return "sqft";
  if (/वर्गमी|sq\.?m|sqm|squaremet|squaremt/.test(s)) return "sqm";
  if (/एकड़|एकड|acre/.test(s)) return "acre";
  return null;
}

const DISTRICT_OK = (d: string | null) => {
  if (!d) return true; // not stated → rely on the exact location match
  const k = locationKey(d);
  return k.includes("ग्वालियर") || k.includes("gwalior");
};

const ZONE_LABEL: Record<ZoneType, string> = {
  nigam1: "नगर निगम ग्वालियर क्षेत्र",
  nigam2: "अन्य नगर निगम क्षेत्र",
  nagar: "नगर निवेश/Planning Area",
  parishad: "नगर परिषद क्षेत्र",
  gramin: "ग्रामीण/Non-Planning",
};

@Injectable()
export class GuidelineLookupService {
  private readonly log = new Logger(GuidelineLookupService.name);

  /**
   * Returns a value only when every input the office calculator needs is known
   * from the deed; otherwise null so the bot hands over to staff.
   * Road premium is not in a deed → assumed 0 and stated as an assumption.
   *
   * opts.plot: the customer's answers for a plot (undefined = not asked, e.g. a
   * conversation that started before these questions existed; null = "पता नहीं").
   *  - hasBuilding true/null → a house/construction needs floor details → staff (null).
   *  - corner true → +10% (office calculator rule 2.2); false → none; null/undefined → none, stated.
   *  - नींव भरा (+10%, rule 2.3) is not asked → never added, stated.
   */
  async lookup(
    p: DeedProperty,
    opts: { owners?: number; plot?: { hasBuilding?: boolean | null; corner?: boolean | null } } = {},
  ): Promise<GuidelineResult | null> {
    if (!DISTRICT_OK(p.district)) return null;
    const entry = matchEntry(p);
    if (!entry) return null;
    const unit = parseUnit(p.areaUnit);
    const area = Number(p.areaValue);
    if (!unit || !(area > 0)) return null;

    const assumptions: string[] = [];
    const zone = detectZoneType(entry);
    let method: GuidelineResult["method"];
    let total: number;
    const lines: string[] = [];

    if (p.propertyType === "residential_plot" || p.propertyType === "commercial") {
      if (unit === "hect" || unit === "acre") return null; // unusual for a plot → staff
      const hasBuilding = opts.plot?.hasBuilding;
      if (hasBuilding === true || hasBuilding === null) return null; // house / unknown → staff
      method = "plot";
      const use = p.propertyType === "commercial" ? "com" : "res";
      const sqm = plotAreaToSqm(area, unit);
      const corner = opts.plot?.corner === true;
      const r = plotValue({ entry, areaSqm: sqm, use, corner });
      total = r.value;
      lines.push(`दर: ₹${inr(r.rate)} प्रति वर्गमीटर (${use === "com" ? "व्यावसायिक" : "आवासीय"} भूखण्ड${corner ? ", कॉर्नर +10%" : ""})`);
      lines.push(`क्षेत्रफल: ${+sqm.toFixed(2)} वर्गमीटर`);
      assumptions.push("सड़क प्रीमियम 0% माना गया (रजिस्ट्री से तय नहीं होता)");
      if (opts.plot?.corner == null) assumptions.push("कॉर्नर प्रीमियम नहीं जोड़ा गया (कॉर्नर की जानकारी नहीं)");
      assumptions.push("नींव भरे प्लॉट का +10% प्रीमियम नहीं जोड़ा गया");
    } else if (p.propertyType === "agricultural") {
      if (!zone) return null;
      assumptions.push("सड़क प्रीमियम 0% माना गया (रजिस्ट्री से तय नहीं होता)");
      const owners = Math.max(1, opts.owners ?? 1);
      if (owners > 1 && zone !== "gramin") return null; // separate-khata multiplier needs staff
      const sqm = agriAreaToSqm(area, unit === "sqft" ? "sqm" : unit);
      if (unit === "sqft") return null;
      if (p.diverted === true) {
        if (!p.divertedUse) return null;
        method = "diverted";
        const r = divertedValue({ entry, areaSqm: sqm, use: p.divertedUse, zone });
        total = r.total;
        for (const l of r.lines) {
          lines.push(
            l.kind === "plot"
              ? `${+l.sqm.toFixed(2)} वर्गमीटर × ₹${inr(l.rate)} = ₹${inr(l.value)}`
              : `शेष ${+(l.hect ?? 0).toFixed(5)} हेक्टेयर × ₹${inr(l.rate)} (सिंचित × 1.5) = ₹${inr(l.value)}`,
          );
        }
      } else {
        if (p.diverted == null || !p.irrigation) return null; // must be stated in the deed
        method = "agri";
        const r = agriValue({ entry, areaSqm: sqm, irrigated: p.irrigation === "irrigated", zone });
        total = r.total;
        for (const l of r.lines) {
          lines.push(
            l.kind === "plot"
              ? `${+l.sqm.toFixed(2)} वर्गमीटर × ₹${inr(l.rate)} (भूखण्ड दर ${Math.round((l.pct ?? 1) * 100)}%) = ₹${inr(l.value)}`
              : `${+(l.hect ?? 0).toFixed(5)} हेक्टेयर × ₹${inr(l.rate)} (${p.irrigation === "irrigated" ? "सिंचित" : "असिंचित"}) = ₹${inr(l.value)}`,
          );
        }
      }
      lines.unshift(`क्षेत्र: ${ZONE_LABEL[zone]} | क्षेत्रफल: ${area} ${p.areaUnit}`);
    } else {
      return null; // house / flat need construction details → staff
    }

    const stamp = stampDuty(total, entry);
    const out: GuidelineResult = {
      year: GUIDELINE_YEAR,
      sno: entry.sno,
      matchedLocality: `${entry.hi}${/^\d+$/.test(entry.ward.trim()) ? ` (वार्ड ${entry.ward})` : ""}`,
      method,
      zone,
      ratePerUnit:
        method === "plot"
          ? plotValue({ entry, areaSqm: 1, use: p.propertyType === "commercial" ? "com" : "res", corner: opts.plot?.corner === true }).rate
          : 0,
      unit: "वर्गमीटर",
      area,
      marketValue: Math.round(total),
      lines,
      assumptions,
      stamp,
    };
    this.log.log(`guideline match sno=${entry.sno} method=${method} value=${out.marketValue}`);
    return out;
  }
}

export { inr as formatInr };
