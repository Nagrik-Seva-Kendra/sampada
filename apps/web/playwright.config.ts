import { defineConfig } from "@playwright/test";

/**
 * Browser tests against a running app (API + built web on one origin).
 * Not part of `pnpm test` (they need a server and a seeded owner):
 *   E2E_BASE_URL=http://localhost:3999 E2E_LOGIN=owner@x E2E_PASSWORD=… pnpm --filter @sampada/web e2e
 * PLAYWRIGHT_CHROMIUM_PATH points at a local Chromium when the bundled one is not installed.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3999",
    viewport: { width: 1280, height: 900 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
});
