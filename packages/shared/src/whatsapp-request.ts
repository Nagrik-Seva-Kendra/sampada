import { z } from "zod";
import type { IdPhotoKind } from "./id-photos.js";
import type { WaNotification } from "./wa-notify.js";

/**
 * API contract for the web "WhatsApp अनुरोध" pages: draft requests collected
 * by the WhatsApp bot (DraftIntake rows), shown to the office for follow-up.
 */

/** Office workflow once the customer has submitted the request. */
export const WaWorkStatus = z.enum([
  "NEW",
  "IN_PROGRESS",
  "DRAFT_READY",
  /** The customer replied "सही है" to the draft sent on WhatsApp. */
  "CUSTOMER_APPROVED",
  /** The customer replied with a correction to the draft. */
  "CORRECTION_REQUESTED",
  "DONE",
  "REJECTED",
]);
export type WaWorkStatus = z.infer<typeof WaWorkStatus>;

/** The bot conversation's own state. */
export const WaIntakeStatus = z.enum(["ACTIVE", "SUBMITTED", "CANCELLED"]);
export type WaIntakeStatus = z.infer<typeof WaIntakeStatus>;

export interface WaPropertySummary {
  district: string | null;
  tehsil: string | null;
  village: string | null;
  locality: string | null;
  khasraOrPlotNo: string | null;
  propertyType: string | null;
  areaValue: number | null;
  areaUnit: string | null;
}

/** Row on the list page. Phone is masked to its last 4 digits. */
export interface WaRequestListItem {
  id: string;
  /** Request number the customer was given: last 6 chars of id, uppercase. */
  ref: string;
  customerName: string | null;
  phoneMasked: string;
  status: WaIntakeStatus;
  workStatus: WaWorkStatus | null;
  needsStaff: boolean;
  createdAt: string;
  buyerName: string | null;
  amount: number | null;
  amountMode: "CUSTOM" | "GUIDELINE" | null;
  /** e.g. "वार्ड 12, ग्वालियर · खसरा 45/2" (null when nothing was read from the registry). */
  propertySummary: string | null;
  assigneeName: string | null;
  /** Which document the customer asked for (older requests: "sale"). */
  deedType: WaDeedType;
}

export type WaDeedType = "sale" | "mortgage" | "other";
export type WaDocState = "received" | "later" | null;

/** One person on a mortgage deed (the mortgagor or a witness). Aadhaar masked. */
export interface WaPerson {
  role: string; // "बंधककर्ता" | "पहला गवाह" | "दूसरा गवाह"
  name: string | null;
  /** पुत्र / पुत्री / पत्नी -- decides "पुत्र श्री" / "पत्नी श्री" and the honorific. */
  relation: "पुत्र" | "पुत्री" | "पत्नी" | null;
  fatherName: string | null;
  motherName: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  aadhaarMasked: string | null;
  /** Read from the Aadhaar/PAN card when the customer confirmed it. */
  dob?: string | null;
  gender?: string | null;
  panMasked?: string | null;
}

/** State of one ID photo: received (viewable), customer will send later, deleted by retention, or not yet. */
export type WaIdPhotoState = "received" | "later" | "deleted" | null;

/** One person's ID-card photos and the checks made on them. */
export interface WaIdCards {
  /** "buyer" | "mortgagor" | "witness1" | "witness2" -- used by GET /:id/id-photo?party=. */
  party: string;
  heading: string;
  photos: { kind: IdPhotoKind; label: string; state: WaIdPhotoState }[];
  /** Filled from the card after the customer said "हाँ" (else typed). */
  aadhaarFromCard: boolean;
  panFromCard: boolean;
  /** Hindi warnings ("आधार और PAN कार्ड पर नाम मेल नहीं खाता" ...). */
  warnings: string[];
}

export interface WaRequestList {
  data: WaRequestListItem[];
  /** Badge count: NEW for OWNER/ADMIN; for others their own NEW + IN_PROGRESS. */
  newCount: number;
}

/** GET /whatsapp/requests/summary -- drives the sidebar item. */
export interface WaRequestSummary {
  newCount: number;
  /** OWNER/ADMIN: sees every request, assigns, reveals. */
  canManage: boolean;
  /** Show the sidebar item: always for managers, others only with ≥1 assigned request. */
  visible: boolean;
}

export interface WaDeedParty {
  name: string;
  relation: string | null;
}

/** Full request. Aadhaar/PAN are masked here; POST /reveal returns them (OWNER/ADMIN only). */
export interface WaRequestDetail extends WaRequestListItem {
  /** Full WhatsApp number -- staff need it to contact the customer. */
  phone: string;
  step: string;
  updatedAt: string;
  assigneeId: string | null;
  staffNote: string | null;
  buyer: {
    name: string | null;
    relation: "पुत्र" | "पुत्री" | "पत्नी" | null;
    fatherName: string | null;
    motherName: string | null;
    mobile: string | null;
    email: string | null;
    address: string | null;
    aadhaarMasked: string | null;
    panMasked: string | null;
    dob?: string | null;
    gender?: string | null;
  };
  sellerPanMasked: string | null;
  tax: { panRequired: boolean; sftReported: boolean; tdsApplies: boolean } | null;
  registry: {
    isSaleDeed: boolean;
    documentType: string | null;
    registrationNo: string | null;
    registrationDate: string | null;
    /** Buyers of the old deed = current owners (sellers of the new one). */
    currentOwners: WaDeedParty[];
    previousSellers: WaDeedParty[];
    property: WaPropertySummary | null;
    consideration: number | null;
  } | null;
  /**
   * The customer's answers for a plot deed (null when not asked -- not a plot,
   * or the conversation predates the questions). Each: true/false, null = "पता नहीं".
   */
  plot: { hasBuilding: boolean | null; corner: boolean | null; boundaryWall: boolean | null } | null;
  /** बंधक पत्र: papers, owner check, and the mortgagor + two witnesses in that order (null for other documents). */
  mortgage: {
    people: WaPerson[];
    /** Each required paper: received, customer will send it later, or not yet. */
    docs: { sanction: WaDocState; registry: WaDocState; transfer: WaDocState };
    /** Registry's owner is still the owner (false: died / will / mutation ... → transfer paper). null = पता नहीं, undefined → not asked yet. */
    ownerIsCurrent: boolean | null | undefined;
    /** Owners named in the registry, as read from it. */
    registryOwners: string[];
  } | null;
  /** "कोई और दस्तावेज़": what the customer wrote they want (e.g. "दान पत्र"). */
  requestedDeed: string | null;
  /** ID-card photos per person (empty when none were asked). */
  idCards: WaIdCards[];
  /** When the ID photos were deleted by the retention job (ISO), else null. */
  idPhotosPurgedAt: string | null;
  /** Request number(s) whose details the returning customer chose to reuse (same WhatsApp number). */
  reusedFrom?: string[];
  /** The deed (in the app) drafted for this request, once linked. */
  deed?: { id: string; type: string; title: string } | null;
  /** Draft sent to the customer for checking, and their answer. */
  draftReview?: {
    /** pending: not delivered yet (24h window closed); sent: waiting for the answer; approved / correction: answered. */
    state: "pending" | "sent" | "approved" | "correction";
    sentAt: string | null;
    reply: string | null;
    replyAt: string | null;
  } | null;
  /** OWNER/ADMIN, linked deed and status DRAFT_READY: may send the draft to the customer. */
  canSendDraft?: boolean;
  /** WhatsApp messages sent for this request (status updates ...), oldest first. PENDING ones can be resent. */
  notifications?: WaNotification[];
  /** Files the customer sent: index 0 is the registry, then extras. */
  documents: { index: number; label: string }[];
  /** Whether the caller may use POST /reveal. */
  canReveal: boolean;
  /** Whether the caller may change the assignee (OWNER/ADMIN). */
  canAssign: boolean;
}

export interface WaRevealResult {
  aadhaar: string | null;
  pan: string | null;
  sellerPan: string | null;
  /** Mortgage deeds: each person's Aadhaar, same order as detail.mortgage.people. */
  people: { role: string; aadhaar: string | null }[];
}

export interface WaAssignee {
  id: string;
  name: string;
}

export const WaRequestUpdateInput = z
  .object({
    workStatus: WaWorkStatus.optional(),
    assigneeId: z.string().trim().min(1).max(64).nullable().optional(),
    staffNote: z.string().max(2000).nullable().optional(),
    /** Link (or unlink with null) the deed drafted for this request. */
    deedTemplateId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict();
export type WaRequestUpdateInput = z.infer<typeof WaRequestUpdateInput>;

/** POST /whatsapp/requests/:id/send-draft -- the customer-copy PDF built in the browser. */
export const WaSendDraftInput = z.object({ pdfBase64: z.string().min(10).max(14_000_000) }).strict();
export type WaSendDraftInput = z.infer<typeof WaSendDraftInput>;

/** GET /whatsapp/requests/:id/draft-for-customer -- deed text with every Aadhaar/PAN cut to its last 4. */
export interface WaDraftForCustomer {
  title: string;
  content: string;
  fileName: string;
}

const AADHAAR_IN_TEXT = /(?<![\d०-९])([2-9२-९][\d०-९]{3})[\s-]?([\d०-९]{4})[\s-]?([\d०-९]{4})(?![\d०-९])/g;
const PAN_IN_TEXT = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

/**
 * Customer copy of a deed: every Aadhaar number (12 digits, spaced or not,
 * Devanagari digits too) becomes "XXXX XXXX 1234" and every PAN "XXXXXX234F"
 * -- only the last 4 characters stay.
 */
export function maskIdNumbers(text: string): string {
  return text
    .replace(AADHAAR_IN_TEXT, (_m, _a, _b, c: string) => `XXXX XXXX ${c}`)
    .replace(PAN_IN_TEXT, (p) => `XXXXXX${p.slice(-4)}`);
}
