// Regenerates src/whatsapp/guideline/gwalior-2026-27.data.ts from the office
// calculator HTML (its `const RAW = [...]` table).
// Usage: node scripts/gen-guideline-data.mjs <path/to/MP_Guideline_Calculator_2026-27.html>
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const file = process.argv[2];
if (!file) throw new Error("pass the calculator HTML path");
const html = fs.readFileSync(file, "utf8");
const a = html.indexOf("const RAW = [");
const b = html.indexOf("];", a);
if (a < 0 || b < 0) throw new Error("RAW table not found");
const RAW = vm.runInNewContext(html.slice(a + "const RAW = ".length, b + 1));
const lines = RAW.map((r) => JSON.stringify(r)).join(",\n");
const out = `/* eslint-disable */
// AUTO-GENERATED from the office guideline calculator "MP_Guideline_Calculator_2026-27.html"
// (RAW table, ${RAW.length} rows). Do not edit by hand; regenerate with scripts/gen-guideline-data.mjs.
// Columns: [sno, hi, en, ward, tehsil, pr, pc, pi, brt, bbt, btt, ktt, shop, office, godown,
//           multi_res, multi_com, agri_irr, agri_unirr, subcl_res, subcl_com]
export type GuidelineRow = [number, string, string, string, string, ...number[]];
export const GUIDELINE_YEAR = "2026-27";
export const GUIDELINE_DISTRICT = "ग्वालियर";
export const GWALIOR_2026_27_RAW: GuidelineRow[] = [
${lines}
] as GuidelineRow[];
`;
const dest = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src/whatsapp/guideline/gwalior-2026-27.data.ts");
fs.writeFileSync(dest, out);
console.log(`wrote ${RAW.length} rows -> ${dest}`);
