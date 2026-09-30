import { z } from "zod";

/**
 * API contract for the web "WhatsApp अनुरोध" pages: draft requests collected
 * by the WhatsApp bot (DraftIntake rows), shown to the office for follow-up.
 */

/** Office workflow once the customer has submitted the request. */
export const WaWorkStatus = z.enum(["NEW", "IN_PROGRESS", "DRAFT_READY", "DONE", "REJECTED"]);
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
  fatherName: string | null;
  motherName: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  aadhaarMasked: string | null;
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
    fatherName: string | null;
    motherName: string | null;
    mobile: string | null;
    email: string | null;
    address: string | null;
    aadhaarMasked: string | null;
    panMasked: string | null;
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
  })
  .strict();
export type WaRequestUpdateInput = z.infer<typeof WaRequestUpdateInput>;
