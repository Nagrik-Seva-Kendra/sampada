// One-off migration: import the legacy `deed` master table (PHP/MariaDB) into
// the new app's sample-deeds store. Decodes the double-encoded Hindi, restores
// line breaks, infers a deed type from the name, and preserves the original
// status / creator / date.
//
// Idempotent: on each run it removes prior legacy imports (createdById "legacy"
// or "admin", or any record carrying a legacyId) and re-imports fresh, while
// leaving app-created records (real user ids) untouched.
//
// Usage:  node scripts/migrate-legacy-deeds.mjs [path-to-dump.sql]
//   defaults to ../../infra/legacy-db/mperegis_sampada.sql
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { streamTable } from "./legacy/sqlparse.mjs";
import { fixText, fixContent } from "./legacy/fix.mjs";
import { classify } from "./legacy/classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dump = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(here, "../../../infra/legacy-db/mperegis_sampada.sql");

// Match the API's storage location (sample-deeds.service.ts).
const recordsDir = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, "..", "sample-deeds", "records")
  : path.resolve(here, "..", "uploads", "sample-deeds", "records");

const LEGACY_IDS = new Set(["legacy", "admin"]); // prior-import creator ids to replace

function legacyDateToIso(d) {
  const s = (d || "").trim();
  if (!s || s.startsWith("0000")) return new Date().toISOString();
  // Treat the stored wall-clock time as UTC (matches the prior import).
  const iso = s.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

async function main() {
  if (!fs.existsSync(dump)) {
    console.error("Dump not found:", dump);
    process.exit(1);
  }
  fs.mkdirSync(recordsDir, { recursive: true });

  // 1) Remove prior legacy imports; keep app-created records.
  let removed = 0, kept = 0;
  for (const f of fs.readdirSync(recordsDir)) {
    if (!f.endsWith(".json")) continue;
    const full = path.join(recordsDir, f);
    let d;
    try { d = JSON.parse(fs.readFileSync(full, "utf8")); } catch { continue; }
    if (d.legacyId !== undefined || LEGACY_IDS.has(d.createdById)) {
      fs.unlinkSync(full);
      removed++;
    } else {
      kept++;
    }
  }
  console.log(`Cleared ${removed} prior legacy records (kept ${kept} app-created).`);

  // 2) Stream the legacy `deed` master and write one record per deed.
  const byType = {};
  const statusCount = {};
  let written = 0;
  await streamTable(dump, "deed", (row, cols) => {
    const o = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
    const title = (fixText(o.deed_name) || "").trim() || "(अशीर्षक विलेख)";
    const content = fixContent(o.deed_description);
    const type = classify(title);
    const status = (o.deed_status || "").trim().toLowerCase() === "active" ? "active" : "inactive";
    const user = (o.deed_user || "").trim() || "admin";
    const id = "legacy-" + o.deed_id;
    const item = {
      id,
      type,
      title: title.slice(0, 200),
      content,
      status,
      createdById: "legacy",
      createdByName: user.toLowerCase() === "sample" ? "sample" : user,
      createdByRole: "ADMIN",
      createdAt: legacyDateToIso(o.deed_date),
      legacyId: Number(o.deed_id),
    };
    fs.writeFileSync(path.join(recordsDir, `${type}__${id}.json`), JSON.stringify(item), "utf8");
    written++;
    byType[type] = (byType[type] || 0) + 1;
    statusCount[status] = (statusCount[status] || 0) + 1;
  });

  console.log(`\nImported ${written} deeds.`);
  console.log("by type:", JSON.stringify(byType, null, 2));
  console.log("by status:", JSON.stringify(statusCount));
}

main().catch((e) => { console.error(e); process.exit(1); });
