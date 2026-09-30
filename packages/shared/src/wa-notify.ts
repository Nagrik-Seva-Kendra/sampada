/**
 * Messages the office sends to WhatsApp customers (and owner alerts) outside
 * the bot conversation. Inside WhatsApp's 24-hour customer-service window a
 * plain text is sent; outside it Meta allows only an approved template, listed
 * here (WA_TEMPLATES) and submitted for approval with
 * POST /whatsapp/templates/submit.
 */
import type { WaWorkStatus } from "./whatsapp-request.js";

/** Statuses the customer is told about. */
export const WA_NOTIFY_STATUSES = ["IN_PROGRESS", "DRAFT_READY", "DONE", "REJECTED"] as const satisfies readonly WaWorkStatus[];

/** Short status phrase (template {{2}}) and the full text sent inside the window. */
export const WA_STATUS_PHRASE: Record<(typeof WA_NOTIFY_STATUSES)[number], string> = {
  IN_PROGRESS: "आपके काम पर कार्य शुरू हो गया है",
  DRAFT_READY: "आपका ड्राफ्ट तैयार है, स्टाफ जल्द संपर्क करेगा",
  DONE: "आपका काम पूरा हो गया है",
  REJECTED: "अनुरोध आगे नहीं बढ़ाया जा सका, कृपया कार्यालय से संपर्क करें",
};

export function statusText(ref: string, status: (typeof WA_NOTIFY_STATUSES)[number]): string {
  return `नमस्ते, नागरिक सेवा केंद्र से सूचना:\nअनुरोध नंबर ${ref} — ${WA_STATUS_PHRASE[status]}।\nधन्यवाद।`;
}

export interface WaTemplateDef {
  name: string;
  language: string;
  category: "UTILITY";
  /** Body with {{1}}, {{2}} ... (Meta: may not start or end with a variable). */
  body: string;
  /** One example value per variable, required by Meta for review. */
  example: string[];
}

/**
 * Templates the app uses when the 24-hour window is closed. The owner can edit
 * the wording here; a changed template must be re-submitted and re-approved.
 */
export const WA_TEMPLATES = {
  status: {
    name: "request_status_update",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते, नागरिक सेवा केंद्र से सूचना: अनुरोध नंबर {{1}} — {{2}}। धन्यवाद।",
    example: ["AB12CD", "आपका ड्राफ्ट तैयार है, स्टाफ जल्द संपर्क करेगा"],
  },
} as const satisfies Record<string, WaTemplateDef>;

export type WaNotificationKind = "STATUS" | "ALERT" | "DRAFT";
/** SENT: accepted by WhatsApp. PENDING: could not be sent (window closed and template not approved, ...) -- resend by hand. */
export type WaNotificationStatus = "SENT" | "PENDING";

/** One message sent (or attempted) for a request, shown on the detail page. */
export interface WaNotification {
  id: string;
  kind: WaNotificationKind;
  status: WaNotificationStatus;
  /** "text" inside the 24h window, "template" outside it. */
  via: "text" | "template" | null;
  /** Masked recipient ("********3210"). */
  toMasked: string;
  body: string;
  /** Short reason when PENDING (e.g. "टेम्पलेट स्वीकृत नहीं"). */
  reason: string | null;
  createdAt: string;
  sentAt: string | null;
}

/** GET /whatsapp/templates: each configured template's state at Meta. */
export interface WaTemplateStatus {
  key: string;
  name: string;
  /** Meta's status (APPROVED, PENDING, REJECTED ...), or null when not submitted. */
  status: string | null;
}
