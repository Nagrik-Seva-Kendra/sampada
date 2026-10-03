import type { WaRegistrySchedule, WaWorkStatus } from "@sampada/shared";
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

const WEEKDAY = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], hi: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"] };
/** "15/10/2026 (Thu)" for an IST day "YYYY-MM-DD". */
export function formatDay(day: string, lang: WaLang): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)} (${WEEKDAY[lang][new Date(`${day}T00:00:00Z`).getUTCDay()]})`;
}

/** The registry day to show: confirmed (with time) else the customer's preferred one; null when neither. */
export function registryWhen(s: WaRegistrySchedule | undefined, lang: WaLang, t: WaT): { text: string; confirmed: boolean } | null {
  if (!s) return null;
  if (s.registryDate) return { text: `${formatDay(s.registryDate, lang)}${s.registryTime ? ` ${s.registryTime}` : ""}`, confirmed: true };
  if (s.preferredDate) {
    const tod = s.timeOfDay === "MORNING" ? ` ${t("rgMorning")}` : s.timeOfDay === "AFTERNOON" ? ` ${t("rgAfternoon")}` : "";
    return { text: `${formatDay(s.preferredDate, lang)}${tod}`, confirmed: false };
  }
  return null;
}
