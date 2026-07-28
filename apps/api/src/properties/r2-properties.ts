import { randomUUID } from "node:crypto";
import { r2Configured, r2Get, r2Put } from "../guideline/r2.js";

/** Reuses the guideline feature's minimal R2 client (env-configured, falls back to Postgres bytes when unset). */
export { r2Configured, r2Get, r2Put };

/** A fresh object key for a property listing photo. */
export function newPropertyImageKey(): string {
  return `properties/${randomUUID()}`;
}
