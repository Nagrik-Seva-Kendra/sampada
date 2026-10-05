/**
 * Messages the office sends to WhatsApp customers (and owner alerts) outside
 * the bot conversation. Inside WhatsApp's 24-hour customer-service window a
 * plain text is sent; outside it Meta allows only an approved template, listed
 * here (WA_TEMPLATES) and submitted for approval with
 * POST /whatsapp/templates/submit.
 */
import type { WaWorkStatus } from "./whatsapp-request.js";

/** Words the customer uses to approve the draft ("SAHI HAI"); anything else is a correction. */
export const DRAFT_APPROVE_RE = /^\s*(सही\s*है|सही|sahi(\s*hai)?|sahee(\s*hai)?|correct|ok|okay|ठीक\s*है|हाँ\s*सही\s*है)\s*[।.!]*\s*$/i;

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
  // v2: the first version (6 variables in a short body, a masked number with "*" as an example)
  // was refused by Meta with code 100. Fewer variables, more text, plain examples, new name.
  alert: {
    name: "new_request_alert_v2",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते, नागरिक सेवा केंद्र में नया WhatsApp अनुरोध आया है। अनुरोध नंबर {{1}}, दस्तावेज़ {{2}}, ग्राहक {{3}}। स्टाफ जाँच ज़रूरी: {{4}}। कृपया ऐप में WhatsApp अनुरोध पेज खोलकर इसे देखें। धन्यवाद।",
    example: ["AB12CD", "विक्रय पत्र", "अमित शर्मा", "नहीं"],
  },
  draft: {
    name: "draft_review_ready",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते, अनुरोध नंबर {{1}} का ड्राफ्ट जाँच के लिए तैयार है। कृपया इस नंबर पर कोई भी संदेश भेजें, हम ड्राफ्ट की PDF भेज देंगे। धन्यवाद।",
    example: ["AB12CD"],
  },
  partyPapers: {
    name: "party_papers_request",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते {{1}}, नागरिक सेवा केंद्र से संदेश: आपके {{2}} के ड्राफ्ट के लिए कृपया इस नंबर पर ज़रूरी कागज़ की PDF या साफ़ फ़ोटो भेजें। धन्यवाद।",
    example: ["रमेश जी", "विक्रय पत्र"],
  },
  staffTask: {
    name: "staff_task",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते {{1}}, ऑफिस से नया काम: {{2}}। पूरा होने पर इसी नंबर पर हो गया लिखें। धन्यवाद।",
    example: ["राहुल", "कल 10 बजे तहसील जाना है"],
  },
  ownerDigest: {
    name: "owner_task_digest",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते, आज {{1}} काम हैं और {{2}} पुराने काम बाकी हैं। पूरी सूची के लिए काम लिखें। धन्यवाद।",
    example: ["3", "1"],
  },
  leaveRequest: {
    name: "leave_request",
    language: "hi",
    category: "UTILITY",
    body: "छुट्टी की अर्ज़ी #{{1}}: {{2}}। जवाब के लिए मंज़ूर या नामंज़ूर के साथ अर्ज़ी नंबर लिखें। धन्यवाद।",
    example: ["5", "राहुल, 12/10 से 13/10, बीमारी"],
  },
  staffNotice: {
    name: "staff_notice",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते {{1}}, नागरिक सेवा केंद्र से सूचना: {{2}}। धन्यवाद।",
    example: ["राहुल", "आपकी छुट्टी की अर्ज़ी #5 मंज़ूर हो गई"],
  },
  registryDate: {
    name: "registry_date_confirmed",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते, अनुरोध नंबर {{1}} की रजिस्ट्री {{2}} को तय हुई है। सभी पक्षकार और 2 गवाह अपना मूल पहचान पत्र साथ लाएँ। धन्यवाद।",
    example: ["AB12CD", "15/10/2026 (गुरुवार), 11:00 बजे"],
  },
  registryReminder: {
    name: "registry_reminder",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते, याद दिलाना: अनुरोध नंबर {{1}} की रजिस्ट्री कल {{2}} को है। सभी पक्षकार और 2 गवाह मूल पहचान पत्र साथ लाएँ। {{3}} धन्यवाद।",
    example: ["AB12CD", "15/10/2026 (गुरुवार), 11:00 बजे", "जियो-टैग फ़ोटो संपदा 2.0 ऐप से ले ली हो तो ठीक, नहीं तो ऑफिस से संपर्क करें।"],
  },
  followUp: {
    name: "follow_up_reminder",
    language: "hi",
    category: "UTILITY",
    body: "नागरिक सेवा केंद्र से सूचना: {{1}} ऐसे संदेश बंद करने के लिए बंद लिखें। धन्यवाद।",
    example: ["आपके पट्टे (अनुरोध AB12CD) की अवधि 15/11/2026 को पूरी हो रही है। नवीनीकरण करवाना हो तो हाँ करवाना है लिखें।"],
  },
  rating: {
    name: "service_rating_request",
    language: "hi",
    category: "UTILITY",
    body: "नमस्ते, अनुरोध नंबर {{1}} का काम पूरा हुआ। नागरिक सेवा केंद्र की सेवा कैसी लगी? 1 से 5 में जवाब दें। धन्यवाद।",
    example: ["AB12CD"],
  },
} as const satisfies Record<string, WaTemplateDef>;

/** Meta's template rules we can check before submitting (a refused submission costs a review round). */
export type WaTemplateProblem =
  | "name"
  | "bodyLength"
  | "startsWithVariable"
  | "endsWithVariable"
  | "adjacentVariables"
  | "variableNumbering"
  | "exampleCount"
  | "exampleFormat"
  | "tooManyVariables";

/**
 * Problems Meta would refuse (code 100) a template for: lower-case name, body
 * ≤ 1024 characters, no variable at the very start or end, no two variables
 * side by side, {{1}}..{{n}} in order, one plain example per variable, and
 * enough words around the variables (Meta refuses "too many variables for the
 * length"; we ask for at least 3 words per variable).
 */
export function templateProblems(t: Pick<WaTemplateDef, "name" | "body" | "example">): WaTemplateProblem[] {
  const out: WaTemplateProblem[] = [];
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) out.push("name");
  if (!t.body.trim() || t.body.length > 1024) out.push("bodyLength");
  const body = t.body.trim();
  if (/^\{\{\d+\}\}/.test(body)) out.push("startsWithVariable");
  if (/\{\{\d+\}\}[\s.!।]*$/.test(body)) out.push("endsWithVariable");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) out.push("adjacentVariables");
  const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  if (nums.some((n, i) => n !== i + 1)) out.push("variableNumbering");
  if (t.example.length !== nums.length) out.push("exampleCount");
  if (t.example.some((e) => !e.trim() || /[\n\t*_~`]|\s{4,}/.test(e))) out.push("exampleFormat");
  const words = body
    .replace(/\{\{\d+\}\}/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (nums.length && words < 3 * nums.length) out.push("tooManyVariables");
  return out;
}

export type WaReasonCode =
  | "notConfigured"
  | "windowClosedTemplate"
  | "windowClosed"
  | "templateNotApproved"
  | "cannotReceive"
  | "pdfMissing"
  | "pdfUpload"
  | "noticeSent"
  | "sendFailed";

export type WaNotificationKind = "STATUS" | "ALERT" | "DRAFT" | "REGISTRY" | "FOLLOWUP";
/** SENT: accepted by WhatsApp. PENDING: could not be sent (window closed and template not approved, ...) -- resend by hand. */
export type WaNotificationStatus = "SENT" | "PENDING";

/** One message sent (or attempted) for a request, shown on the detail page. */
export interface WaNotification {
  id: string;
  kind: WaNotificationKind;
  status: WaNotificationStatus;
  /** "text" inside the 24h window, "template" outside it, "document" for a PDF. */
  via: "text" | "template" | "document" | null;
  /** Masked recipient ("********3210"). */
  toMasked: string;
  body: string;
  /** Short reason when PENDING (e.g. "टेम्पलेट स्वीकृत नहीं"). */
  reason: string | null;
  /** The same reason as a code, for the UI's language (null when unknown / none). */
  reasonCode?: WaReasonCode | null;
  /** Graph error code / channel for reasonCode "sendFailed". */
  reasonVars?: { via?: string; code?: string };
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

/** POST /whatsapp/templates/submit: one row per template (code for the UI's language; result = Hindi text). */
export interface WaTemplateSubmitResult {
  key: string;
  name: string;
  code: "exists" | "submitted" | "error" | "invalid";
  status?: string;
  errorCode?: string | number;
  /** Meta's error_subcode / error_user_title / error_user_msg (no tokens or numbers). */
  errorSubcode?: string | number;
  errorTitle?: string;
  errorMessage?: string;
  /** code "invalid": rules broken before submitting (not sent to Meta). */
  problems?: WaTemplateProblem[];
  result: string;
}
