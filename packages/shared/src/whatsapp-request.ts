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
}

export interface WaRequestList {
  data: WaRequestListItem[];
  /** Requests with workStatus NEW (for the sidebar/list badge). */
  newCount: number;
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
  /** Files the customer sent: index 0 is the registry, then extras. */
  documents: { index: number; label: string }[];
  /** Whether the caller may use POST /reveal. */
  canReveal: boolean;
}

export interface WaRevealResult {
  aadhaar: string | null;
  pan: string | null;
  sellerPan: string | null;
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
