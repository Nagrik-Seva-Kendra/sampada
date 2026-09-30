import type { WaWorkStatus } from "@sampada/shared";
import type { WaLang, WaT } from "./waI18n";

/** Status pill colour per work status (labels: WORK_STATUS_KEY in waI18n.ts). */
export const WORK_STATUS_PILL: Record<WaWorkStatus, string> = {
  NEW: "warn",
  IN_PROGRESS: "neutral",
  DRAFT_READY: "good",
  CUSTOMER_APPROVED: "good",
  CORRECTION_REQUESTED: "warn",
  DONE: "good",
  REJECTED: "bad",
};

export const WORK_STATUSES: WaWorkStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "DRAFT_READY",
  "CUSTOMER_APPROVED",
  "CORRECTION_REQUESTED",
  "DONE",
  "REJECTED",
];

/**
 * Amount cell text; never blank. GUIDELINE with no value yet → staff will tell;
 * a number → "₹15,00,000" (+ "(guideline)" when it came from the guideline).
 */
export function formatAmount(amount: number | null | undefined, mode: "CUSTOM" | "GUIDELINE" | null, t: WaT): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : null;
  if (n == null) return mode === "GUIDELINE" ? t("waAmountGuidelinePending") : "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}${mode === "GUIDELINE" ? t("waAmountGuideline") : ""}`;
}

/** Date + time in the chosen language's locale. */
export function formatDate(iso: string, lang: WaLang): string {
  return new Date(iso).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short" });
}
