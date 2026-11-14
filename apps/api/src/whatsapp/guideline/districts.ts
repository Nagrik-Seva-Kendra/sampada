/**
 * Guideline rows for every district of Madhya Pradesh (2026-27).
 *
 * Gwalior keeps the office calculator's own table (gwalior-2026-27.data.ts).
 * The other 51 districts come from the department's registers (English and
 * Hindi PDFs, all 16 rates of every row cross-checked), one gzip file per
 * district under ./data, read only when a customer asks about that district
 * and then kept in memory.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { GUIDELINE_DATA, type GuidelineEntry, normalizeHindiSpelling, type ZoneType } from "./calculator.js";
import { type DistrictInfo, MP_DISTRICTS } from "./district-list.js";

export type { DistrictInfo };
export const GWALIOR: DistrictInfo = { key: "gwalior", en: "Gwalior", hi: "ग्वालियर", rows: GUIDELINE_DATA.length };
export const ALL_DISTRICTS: DistrictInfo[] = [...MP_DISTRICTS, GWALIOR].sort((a, b) => a.en.localeCompare(b.en));
const BY_KEY = new Map(ALL_DISTRICTS.map((d) => [d.key, d]));

export const districtByKey = (key: string | null | undefined): DistrictInfo | null => (key ? (BY_KEY.get(key) ?? null) : null);

/** Where the data files are: next to this module (src, or dist when nest copied the assets), else from the repo root. */
function dataDir(): string | null {
  const candidates = [
    join(__dirname, "data"),
    join(process.cwd(), "src/whatsapp/guideline/data"),
    join(process.cwd(), "apps/api/src/whatsapp/guideline/data"),
    join(process.cwd(), "dist/whatsapp/guideline/data"),
    join(process.cwd(), "apps/api/dist/whatsapp/guideline/data"),
  ];
  return candidates.find((d) => existsSync(join(d, "bhopal.json.gz"))) ?? null;
}

const ZONES = new Set<ZoneType>(["nigam1", "nigam2", "nagar", "parishad", "gramin"]);

/** Row file layout: [sno, hi, en, ward, tehsil, zone, town (Hindi), 16 rates in register order]. */
export function rowToEntry(r: (string | number)[], district: string): GuidelineEntry {
  const num = (i: number) => Number(r[i]) || 0;
  const zone = String(r[5]) as ZoneType;
  return {
    sno: num(0),
    hi: String(r[1] ?? ""),
    en: String(r[2] ?? ""),
    ward: String(r[3] ?? ""),
    teh: String(r[4] ?? ""),
    pr: num(7), pc: num(8), pi: num(9),
    brt: num(10), bbt: num(11), btt: num(12), ktt: num(13),
    shop: num(14), office: num(15), godown: num(16),
    multi_res: num(17), multi_com: num(18),
    agri_irr: num(19), agri_unirr: num(20),
    subcl_res: num(21), subcl_com: num(22),
    zone: ZONES.has(zone) ? zone : undefined,
    urban: zone !== "gramin" && /^\d+$/.test(String(r[3] ?? "")),
    town: String(r[6] ?? "") || undefined,
    district,
  };
}

const cache = new Map<string, GuidelineEntry[]>();

/** The district's rows (Gwalior: the office calculator's table). Empty when the file is missing. */
export function districtRows(key: string | null | undefined): GuidelineEntry[] {
  if (!key || key === "gwalior") return GUIDELINE_DATA;
  const hit = cache.get(key);
  if (hit) return hit;
  const info = BY_KEY.get(key);
  const dir = dataDir();
  if (!info || !dir) return [];
  const file = join(dir, `${key}.json.gz`);
  if (!existsSync(file)) return [];
  const raw = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as (string | number)[][];
  // Rows with no rate at all say nothing.
  const rows = raw.map((r) => rowToEntry(r, info.en)).filter((e) => e.sno > 0 && (e.pr > 0 || e.agri_irr > 0 || e.agri_unirr > 0));
  cache.set(key, rows);
  return rows;
}

// ---------- naming the district in a message ----------
/** Other spellings and the three new districts whose rows are still in the parent district's register. */
const ALIASES: Record<string, string[]> = {
  gwalior: ["gwalior", "gwaliar", "ग्वालियर", "ग्वालियार"],
  narmadapuram: ["hoshangabad", "होशंगाबाद", "narmadapuram", "नर्मदापुरम"],
  singroli: ["singrauli", "singroli", "सिंगरौली", "सिंगरोली"],
  khargone: ["khargone", "khargon", "खरगोन", "खरगौन"],
  rewa: ["mauganj", "मऊगंज"],
  satna: ["maihar", "मैहर"],
  chhindwara: ["pandhurna", "पांढुर्णा", "पांढुरना", "chindwara", "छिंदवाड़ा", "छिन्दवाड़ा"],
  ashoknagar: ["ashoknagar", "ashok nagar", "अशोकनगर", "अशोक नगर"],
  agarmalwa: ["agar malwa", "agarmalwa", "आगर मालवा", "आगर"],
  narsinghpur: ["narsinghpur", "narsingpur", "नरसिंहपुर", "नरसिंगपुर"],
  indore: ["indore", "indour", "इंदौर", "इन्दौर"],
  sehore: ["sehore", "सीहोर", "सिहोर"],
  barwani: ["barwani", "badwani", "बड़वानी", "बडवानी"],
  dindori: ["dindori", "डिंडोरी", "डिंडौरी"],
  tikamgarh: ["tikamgarh", "टीकमगढ़", "टीकमगढ"],
  rajgarh: ["rajgarh", "राजगढ़", "राजगढ"],
};

const norm = (s: string) =>
  normalizeHindiSpelling(s.toLowerCase())
    .replace(/[.,()\-–—/:;'"`!?।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NAMES: { key: string; name: string }[] = ALL_DISTRICTS.flatMap((d) =>
  [d.en, d.hi, ...(ALIASES[d.key] ?? [])].map((n) => ({ key: d.key, name: norm(n) })),
).sort((a, b) => b.name.length - a.name.length);

/**
 * The district a message names ("ganga vihar ward 60 gwalior", "सागर में मकान"),
 * with the name taken out of the text so it is not read as part of the locality.
 * A district written in front of a place word ("Datia Road", "इंदौर रोड") is a street, not the district.
 */
export function detectDistrict(text: string): { key: string; rest: string } | null {
  const t = ` ${norm(text)} `;
  for (const { key, name } of NAMES) {
    const re = new RegExp(`(^|\\s)${esc(name)}(?=\\s)`, "u");
    const m = re.exec(t);
    if (!m) continue;
    const after = t.slice(m.index + m[0].length).trim().split(" ")[0] ?? "";
    // "Datia Road", "सागर ताल", "Indore wala": a street or place named after the district.
    if (PLACE_AFTER.test(after)) continue;
    return { key, rest: withoutName(text, name) };
  }
  return null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLACE_AFTER =
  /^(road|rd|रोड|marg|मार्ग|bypass|बायपास|chauraha|चौराहा|naka|नाका|gate|गेट|wala|वाला|wali|वाली|colony|कॉलोनी|कालोनी|nagar|नगर|vihar|विहार|taal|tal|ताल|tiraha|तिराहा|house|हाउस|bus|बस|stand|स्टैंड)$/;

/** The text without the district's name (and a "जिला" / "district" next to it), as the customer wrote it. */
function withoutName(text: string, name: string): string {
  const words = name.split(" ").map(esc).join("[\\s.\\-]+");
  const re = new RegExp(`(जिला|ज़िला|jila|zila|district|dist\\.?)?\\s*${words}\\s*(जिला|ज़िला|jila|zila|district|dist\\.?|me|mein|में)?(?=[\\s,.।!?]|$)`, "iu");
  const out = normalizeHindiSpelling(text).replace(re, " ");
  return out === normalizeHindiSpelling(text) ? text : out.replace(/\s+/g, " ").trim();
}

/** Districts in which a locality is found (by the caller's matcher), in the order of ALL_DISTRICTS. */
export function districtsWith(find: (rows: GuidelineEntry[]) => GuidelineEntry[], keys: string[] = ALL_DISTRICTS.map((d) => d.key)) {
  const out: { info: DistrictInfo; rows: GuidelineEntry[] }[] = [];
  for (const k of keys) {
    const rows = find(districtRows(k));
    if (rows.length) out.push({ info: BY_KEY.get(k)!, rows });
  }
  return out;
}
