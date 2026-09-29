import type { WaIntakeStatus, WaWorkStatus } from "@sampada/shared";

/** Hindi labels for the "WhatsApp अनुरोध" pages (Hindi-only UI by request). */
export const WORK_STATUS_LABEL: Record<WaWorkStatus, string> = {
  NEW: "नया",
  IN_PROGRESS: "काम चल रहा है",
  DRAFT_READY: "ड्राफ्ट तैयार",
  DONE: "पूर्ण",
  REJECTED: "अस्वीकृत",
};

export const WORK_STATUS_PILL: Record<WaWorkStatus, string> = {
  NEW: "warn",
  IN_PROGRESS: "neutral",
  DRAFT_READY: "good",
  DONE: "good",
  REJECTED: "bad",
};

export const INTAKE_STATUS_LABEL: Record<WaIntakeStatus, string> = {
  ACTIVE: "बातचीत जारी",
  SUBMITTED: "जमा किया",
  CANCELLED: "रद्द",
};

export const WORK_STATUSES: WaWorkStatus[] = ["NEW", "IN_PROGRESS", "DRAFT_READY", "DONE", "REJECTED"];

export function formatAmount(amount: number | null, mode: "CUSTOM" | "GUIDELINE" | null): string {
  if (amount == null) return mode === "GUIDELINE" ? "गाइडलाइन (स्टाफ बताएगा)" : "—";
  return `₹${amount.toLocaleString("en-IN")}${mode === "GUIDELINE" ? " (गाइडलाइन)" : ""}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("hi-IN", { dateStyle: "medium", timeStyle: "short" });
}
