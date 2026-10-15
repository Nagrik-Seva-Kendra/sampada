// Runs after `vite build`. Replaces the __BUILD_ID__ placeholder in
// dist/sw.js with a fresh value so the service worker's bytes change on
// every deploy — that's what makes the browser re-install it and evict
// the previous deploy's cached shell/assets. Without this, VERSION never
// changes and users have to manually clear site data to see updates.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = join(__dirname, "..", "dist", "sw.js");

if (!existsSync(swPath)) {
  console.warn("[stamp-sw] dist/sw.js not found, skipping");
  process.exit(0);
}

const buildId = process.env.SOURCE_COMMIT?.slice(0, 12) || String(Date.now());
const content = readFileSync(swPath, "utf8");

if (!content.includes("__BUILD_ID__")) {
  console.warn("[stamp-sw] __BUILD_ID__ placeholder not found in dist/sw.js, skipping");
  process.exit(0);
}

writeFileSync(swPath, content.replaceAll("__BUILD_ID__", buildId));
console.log(`[stamp-sw] stamped dist/sw.js with build id: ${buildId}`);
