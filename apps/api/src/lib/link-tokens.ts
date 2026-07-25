import { createHash } from "node:crypto";

/** Hash-at-rest: only the SHA-256 of a raw link token is ever stored. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Base URL of the web app, used to build emailed/shared links. */
export function appBaseUrl(): string {
  const fromEnv = process.env.APP_URL ?? (process.env.CORS_ORIGIN ?? "").split(",")[0] ?? "";
  return (fromEnv || "http://localhost:5173").trim().replace(/\/+$/, "");
}
