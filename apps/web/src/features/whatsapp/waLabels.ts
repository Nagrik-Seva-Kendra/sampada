import type { WaDeedType, WaIntakeStatus, WaWorkStatus } from "@sampada/shared";

/** Hindi labels for the "WhatsApp अनुरोध" pages (Hindi-only UI by request). */
export const WORK_STATUS_LABEL: Record<WaWorkStatus, string> = {
  NEW: "नया",
  IN_PROGRESS: "काम चल रहा है",
  DRAFT_READY: "ड्राफ्ट तैयार",
  CUSTOMER_APPROVED: "ग्राहक ने सही बताया",
  CORRECTION_REQUESTED: "ग्राहक ने सुधार माँगा",
  DONE: "पूर्ण",
  REJECTED: "अस्वीकृत",
};

export const WORK_STATUS_PILL: Record<WaWorkStatus, string> = {
  NEW: "warn",
  IN_PROGRESS: "neutral",
  DRAFT_READY: "good",
  CUSTOMER_APPROVED: "good",
  CORRECTION_REQUESTED: "warn",
  DONE: "good",
  REJECTED: "bad",
};

export const INTAKE_STATUS_LABEL: Record<WaIntakeStatus, string> = {
  ACTIVE: "बातचीत जारी",
  SUBMITTED: "जमा किया",
  CANCELLED: "रद्द",
};

export const DEED_TYPE_LABEL: Record<WaDeedType, string> = {
  sale: "विक्रय पत्र",
  mortgage: "बंधक पत्र",
  other: "अन्य दस्तावेज़",
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
 * a number → "₹15,00,000" (+ "(गाइडलाइन)" when it came from the guideline).
 */
export function formatAmount(amount: number | null | undefined, mode: "CUSTOM" | "GUIDELINE" | null): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : null;
  if (n == null) return mode === "GUIDELINE" ? "गाइडलाइन (स्टाफ बताएगा)" : "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}${mode === "GUIDELINE" ? " (गाइडलाइन)" : ""}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("hi-IN", { dateStyle: "medium", timeStyle: "short" });
}
