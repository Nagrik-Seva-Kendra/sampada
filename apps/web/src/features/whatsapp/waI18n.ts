import { useCallback } from "react";
import type { WaDeedType, WaIntakeStatus, WaWorkStatus } from "@sampada/shared";
import { type StringKey, translate } from "../../i18n/strings";
import { useUiStore } from "../../stores/uiStore";

export type WaLang = "en" | "hi";
export type WaT = (key: StringKey, vars?: Record<string, string | number>) => string;

/** translate() with "{name}" placeholders filled. */
export function waT(lang: WaLang, key: StringKey, vars?: Record<string, string | number>): string {
  const s = translate(key, lang);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** The site's EN/hi toggle, for the WhatsApp Requests pages. */
export function useWaT(): { t: WaT; lang: WaLang } {
  const lang = useUiStore((s) => s.lang) as WaLang;
  const t = useCallback<WaT>((key, vars) => waT(lang, key, vars), [lang]);
  return { t, lang };
}

export const WORK_STATUS_KEY: Record<WaWorkStatus, StringKey> = {
  NEW: "waStatusNEW",
  IN_PROGRESS: "waStatusIN_PROGRESS",
  DRAFT_READY: "waStatusDRAFT_READY",
  CUSTOMER_APPROVED: "waStatusCUSTOMER_APPROVED",
  CORRECTION_REQUESTED: "waStatusCORRECTION_REQUESTED",
  DONE: "waStatusDONE",
  REJECTED: "waStatusREJECTED",
};
export const INTAKE_STATUS_KEY: Record<WaIntakeStatus, StringKey> = {
  ACTIVE: "waIntakeACTIVE",
  SUBMITTED: "waIntakeSUBMITTED",
  CANCELLED: "waIntakeCANCELLED",
};
export const DEED_TYPE_KEY: Record<WaDeedType, StringKey> = {
  sale: "waDeedSale",
  mortgage: "waDeedMortgage",
  other: "waDeedOther",
};
