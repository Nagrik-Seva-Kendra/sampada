/**
 * Pure mapping from DraftIntake rows to the web API shapes in
 * @sampada/shared (whatsapp-request.ts). Aadhaar/PAN only ever leave here masked;
 * the one exception is revealSecrets(), used by the OWNER/ADMIN-only endpoint.
 */
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  ID_PHOTO_LABEL,
  ID_WARNING_TEXT,
  type IdPhotoKind,
  SAMPADA_REQUIRED_PARTY_PHOTOS,
  type WaIdCards,
  type WaIdPhotoState,
  type WaDeedParty,
  WaDeedType,
  type WaDocState,
  type WaPerson,
  type WaIntakeStatus,
  type WaPropertySummary,
  type WaRegistrySchedule,
  type WaRequestDetail,
  type WaRequestListItem,
  type WaRevealResult,
  type WaWorkStatus,
} from "@sampada/shared";
import { idWarningsFor } from "./id-cards.js";
import { MORTGAGE_PEOPLE } from "./intake-rules.js";
import { decrypt, mask } from "./pii-crypto.js";
import { maskPhone } from "./webhook-diagnostics.js";

export interface DraftIntakeRow {
  id: string;
  organizationId: string;
  phone: string;
  customerName: string | null;
  status: string;
  step: string;
  data: unknown;
  deed: unknown;
  documentKey: string | null;
  needsStaff: boolean;
  workStatus: string | null;
  assigneeId: string | null;
  staffNote: string | null;
  closedAt?: Date | null;
  idPhotosPurgedAt?: Date | null;
  preferredDate?: string | null;
  alternateDate?: string | null;
  timeOfDay?: string | null;
  geoTagMode?: string | null;
  registryDate?: string | null;
  registryTime?: string | null;
  registryReminderSentAt?: Date | null;
  geoTagPhotos?: number | null;
  geoTagTakenAt?: Date | null;
  followUpKind?: string | null;
  termEndDate?: string | null;
  rating?: number | null;
  ratingAt?: Date | null;
  feedback?: string | null;
  corrections?: unknown;
  packetSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const requestRef = (id: string): string => id.slice(-6).toUpperCase();

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Masks a stored (normally encrypted) Aadhaar/PAN; never throws, never returns the value. */
export function maskSecret(stored: unknown): string | null {
  const s = str(stored);
  if (!s) return null;
  try {
    return mask(decrypt(s));
  } catch {
    return "XXXX????"; // wrong/missing DATA_ENC_KEY -- still never leak the ciphertext
  }
}

function revealSecret(stored: unknown): string | null {
  const s = str(stored);
  return s ? decrypt(s) : null;
}

function parties(v: unknown): WaDeedParty[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p: any) => ({ name: str(p?.name) ?? "", relation: str(p?.relation) }))
    .filter((p) => p.name);
}

function property(v: unknown): WaPropertySummary | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  return {
    district: str(p.district),
    tehsil: str(p.tehsil),
    village: str(p.village),
    locality: str(p.locality),
    khasraOrPlotNo: str(p.khasraOrPlotNo),
    propertyType: str(p.propertyType),
    areaValue: num(p.areaValue),
    areaUnit: str(p.areaUnit),
  };
}

export function propertySummary(p: WaPropertySummary | null): string | null {
  if (!p) return null;
  const place = [p.locality, p.village, p.tehsil, p.district].filter(Boolean).join(", ");
  const parts = [place, p.khasraOrPlotNo ? `खसरा/प्लॉट ${p.khasraOrPlotNo}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const WORK_STATUSES = new Set(["NEW", "IN_PROGRESS", "DRAFT_READY", "CUSTOMER_APPROVED", "CORRECTION_REQUESTED", "DONE", "REJECTED"]);
const INTAKE_STATUSES = new Set(["ACTIVE", "SUBMITTED", "CANCELLED"]);

export function toListItem(row: DraftIntakeRow, assigneeName: string | null): WaRequestListItem {
  const d = (row.data ?? {}) as Record<string, unknown>;
  const deed = (row.deed ?? null) as Record<string, unknown> | null;
  const mode = d.amountMode === "CUSTOM" || d.amountMode === "GUIDELINE" ? d.amountMode : null;
  return {
    id: row.id,
    ref: requestRef(row.id),
    customerName: row.customerName,
    phoneMasked: maskPhone(row.phone),
    status: (INTAKE_STATUSES.has(row.status) ? row.status : "ACTIVE") as WaIntakeStatus,
    workStatus: row.workStatus && WORK_STATUSES.has(row.workStatus) ? (row.workStatus as WaWorkStatus) : null,
    needsStaff: row.needsStaff,
    createdAt: row.createdAt.toISOString(),
    // The list's "खरीदार" column: for a बंधक पत्र it shows the mortgagor.
    buyerName: deedTypeOf(d) === "mortgage" ? str(d.mortgagorName) : str(d.buyerName),
    amount: num(d.amount),
    amountMode: mode,
    propertySummary: propertySummary(property(deed?.property)),
    assigneeName,
    deedType: deedTypeOf(d),
    schedule: scheduleOf(row),
  };
}

/** Registry date + geo-tag of a request (columns, set at submit / by staff). */
export function scheduleOf(row: DraftIntakeRow): WaRegistrySchedule {
  const fee = Number(process.env.GEOTAG_FEE ?? 250);
  return {
    preferredDate: row.preferredDate ?? null,
    alternateDate: row.alternateDate ?? null,
    timeOfDay: row.timeOfDay === "MORNING" || row.timeOfDay === "AFTERNOON" ? row.timeOfDay : null,
    registryDate: row.registryDate ?? null,
    registryTime: row.registryTime ?? null,
    reminderSentAt: row.registryReminderSentAt?.toISOString() ?? null,
    geoTagMode: row.geoTagMode === "SELF" || row.geoTagMode === "STAFF" ? row.geoTagMode : null,
    geoTagPhotos: row.geoTagPhotos ?? null,
    geoTagTakenAt: row.geoTagTakenAt?.toISOString() ?? null,
    geoTagFee: Number.isFinite(fee) && fee >= 0 ? fee : 250,
  };
}

/** canManage = OWNER/ADMIN: may reveal Aadhaar/PAN and change the assignee. */
export function toDetail(row: DraftIntakeRow, assigneeName: string | null, canManage: boolean): WaRequestDetail {
  const d = (row.data ?? {}) as Record<string, unknown>;
  const deed = (row.deed ?? null) as Record<string, unknown> | null;
  const tax = d.tax && typeof d.tax === "object" ? (d.tax as Record<string, unknown>) : null;
  const extra = Array.isArray(d.extraDocs) ? d.extraDocs.filter((k) => typeof k === "string") : [];
  const isMortgage = deedTypeOf(d) === "mortgage";
  const docs = (d.docs && typeof d.docs === "object" ? d.docs : {}) as Record<string, unknown>;
  // Name each file by what it was sent as (बंधक पत्र), else by position.
  const roleLabel = (key: unknown): string | null =>
    key === docs.sanction ? "बैंक सैंक्शन लेटर" : key === docs.registry ? "संपत्ति की रजिस्ट्री" : key === docs.transfer ? "वसीयत/नामांतरण दस्तावेज़" : null;
  const documents: WaRequestDetail["documents"] = [];
  const roleKind = (key: unknown) =>
    key === docs.sanction ? ("sanction" as const) : key === docs.registry ? ("registry" as const) : key === docs.transfer ? ("transfer" as const) : null;
  if (row.documentKey) {
    documents.push({
      index: 0,
      label: roleLabel(row.documentKey) ?? (isMortgage ? "पहला दस्तावेज़" : "पुरानी रजिस्ट्री"),
      kind: roleKind(row.documentKey) ?? (isMortgage ? "first" : "oldRegistry"),
    });
  }
  extra.forEach((k, i) =>
    documents.push({ index: i + 1, label: roleLabel(k) ?? `अतिरिक्त दस्तावेज़ ${i + 1}`, kind: roleKind(k) ?? "extra", n: i + 1 }),
  );
  const docState = (k: string): WaDocState => (docs[k] === "later" ? "later" : typeof docs[k] === "string" ? "received" : null);

  const tri = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);
  const plotAsked = "plotHasBuilding" in d || "plotCorner" in d || "plotBoundary" in d;

  return {
    ...toListItem(row, assigneeName),
    phone: row.phone,
    step: row.step,
    updatedAt: row.updatedAt.toISOString(),
    assigneeId: row.assigneeId,
    staffNote: row.staffNote,
    buyer: {
      name: str(d.buyerName),
      relation: relationOf(d.buyerRelation),
      fatherName: str(d.buyerFatherName),
      motherName: str(d.buyerMotherName),
      mobile: str(d.buyerMobile),
      email: str(d.buyerEmail),
      address: str(d.buyerAddress),
      aadhaarMasked: maskSecret(d.buyerAadhaar),
      panMasked: maskSecret(d.buyerPan),
      dob: str(d.buyerDob),
      gender: str(d.buyerGender),
    },
    sellerPanMasked: maskSecret(d.sellerPan),
    tax: tax
      ? { panRequired: tax.panRequired === true, sftReported: tax.sftReported === true, tdsApplies: tax.tdsApplies === true }
      : null,
    registry: deed
      ? {
          isSaleDeed: deed.isSaleDeed === true,
          documentType: str(deed.documentType),
          registrationNo: str(deed.registrationNo),
          registrationDate: str(deed.registrationDate),
          currentOwners: parties(deed.buyers),
          previousSellers: parties(deed.sellers),
          property: property(deed.property),
          consideration: num(deed.consideration),
        }
      : null,
    mortgage: isMortgage
      ? {
          people: mortgagePeople(d),
          docs: { sanction: docState("sanction"), registry: docState("registry"), transfer: docState("transfer") },
          ownerIsCurrent: "ownerIsCurrent" in d ? tri(d.ownerIsCurrent) : undefined,
          registryOwners: Array.isArray(d.registryOwners) ? d.registryOwners.filter((x): x is string => typeof x === "string") : [],
        }
      : null,
    requestedDeed: str(d.requestedDeed),
    plot: plotAsked
      ? { hasBuilding: tri(d.plotHasBuilding), corner: tri(d.plotCorner), boundaryWall: tri(d.plotBoundary) }
      : null,
    reusedFrom: Object.values((d.reuse ?? {}) as Record<string, any>)
      .filter((r) => r && r.used && typeof r.from === "string")
      .map((r) => requestRef(r.from)),
    idCards: idCards(d),
    idPhotosPurgedAt: row.idPhotosPurgedAt ? row.idPhotosPurgedAt.toISOString() : null,
    satisfaction: {
      rating: row.rating ?? null,
      ratingAt: row.ratingAt?.toISOString() ?? null,
      feedback: row.feedback ?? null,
      corrections: Array.isArray(row.corrections) ? (row.corrections as { text: string; at: string }[]) : [],
      packetSentAt: row.packetSentAt?.toISOString() ?? null,
    },
    documents,
    canReveal: canManage,
    canAssign: canManage,
  };
}

export function revealSecrets(row: DraftIntakeRow): WaRevealResult {
  const d = (row.data ?? {}) as Record<string, unknown>;
  return {
    aadhaar: revealSecret(d.buyerAadhaar),
    pan: revealSecret(d.buyerPan),
    sellerPan: revealSecret(d.sellerPan),
    people:
      deedTypeOf(d) === "mortgage"
        ? MORTGAGE_PEOPLE.map((m) => ({ role: m.heading, aadhaar: revealSecret(d[`${m.prefix}Aadhaar`]) }))
        : [],
  };
}

const relationOf = (v: unknown): "पुत्र" | "पुत्री" | "पत्नी" | null =>
  v === "पुत्र" || v === "पुत्री" || v === "पत्नी" ? v : null;

/** Requests from before document types existed are sale deeds. */
export function deedTypeOf(d: Record<string, unknown>): WaDeedType {
  return d.deedType === "mortgage" || d.deedType === "other" ? d.deedType : "sale";
}

function mortgagePeople(d: Record<string, unknown>): WaPerson[] {
  return MORTGAGE_PEOPLE.map((m) => ({
    role: m.heading,
    name: str(d[`${m.prefix}Name`]),
    relation: relationOf(d[`${m.prefix}Relation`]),
    fatherName: str(d[`${m.prefix}FatherName`]),
    motherName: str(d[`${m.prefix}MotherName`]),
    mobile: str(d[`${m.prefix}Mobile`]),
    email: str(d[`${m.prefix}Email`]),
    address: str(d[`${m.prefix}Address`]),
    aadhaarMasked: maskSecret(d[`${m.prefix}Aadhaar`]),
    dob: str(d[`${m.prefix}Dob`]),
    gender: str(d[`${m.prefix}Gender`]),
    panMasked: maskSecret(d[`${m.prefix}Pan`]),
  }));
}

const ID_PARTIES: { prefix: string; heading: string }[] = [
  { prefix: "buyer", heading: "खरीदार" },
  ...MORTGAGE_PEOPLE.map((m) => ({ prefix: m.prefix, heading: m.heading })),
];
const photoState = (v: unknown): WaIdPhotoState =>
  v === "later" ? "later" : v === "deleted" ? "deleted" : typeof v === "string" ? "received" : null;

/** Each person asked for ID photos: photo states, whether card data was used, and cross-check warnings. */
export function idCards(d: Record<string, unknown>): WaIdCards[] {
  const photos = (d.idPhotos ?? {}) as Record<string, Record<string, unknown>>;
  const pending = (d.idPending ?? {}) as Record<string, Record<string, unknown>>;
  const read = (d.idRead ?? {}) as Record<string, any>;
  return ID_PARTIES.filter((p) => photos[p.prefix] || read[p.prefix]).map((p) => {
    const mine = photos[p.prefix] ?? {};
    const warnKinds = idWarningsFor(read[p.prefix], { fatherName: d[`${p.prefix}FatherName`], relation: d[`${p.prefix}Relation`] });
    const kinds = [...new Set([...SAMPADA_REQUIRED_PARTY_PHOTOS, ...(Object.keys(mine) as IdPhotoKind[])])].filter((k) => k in ID_PHOTO_LABEL);
    return {
      party: p.prefix,
      heading: p.heading,
      photos: kinds.map((kind) => ({ kind, label: ID_PHOTO_LABEL[kind], state: photoState(mine[kind]) })),
      aadhaarFromCard: pending[p.prefix]?.aadhaarOk === true || !!read[p.prefix]?.aadhaarName,
      panFromCard: pending[p.prefix]?.panOk === true || !!read[p.prefix]?.panName,
      warnings: warnKinds.map((w) => ID_WARNING_TEXT[w]),
      warningKinds: warnKinds,
    };
  });
}

/** Storage key of one ID photo, or null (not received, "later", deleted, bad input). Keys only come from the row. */
export function idPhotoKeyAt(row: DraftIntakeRow, party: string, kind: string): string | null {
  if (!ID_PARTIES.some((p) => p.prefix === party) || !(kind in ID_PHOTO_LABEL)) return null;
  const k = ((row.data as any)?.idPhotos?.[party] ?? {})[kind];
  return typeof k === "string" && k.startsWith("whatsapp/") ? k : null;
}

/** Storage key of the index-th file (0 = registry, 1.. = extras), or null. Keys only ever come from the row. */
export function documentKeyAt(row: DraftIntakeRow, index: number): string | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (index === 0) return row.documentKey;
  const extra = (row.data as Record<string, unknown> | null)?.extraDocs;
  const k = Array.isArray(extra) ? extra[index - 1] : undefined;
  return typeof k === "string" ? k : null;
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
export function mimeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

/**
 * Local-disk path WhatsappService.downloadMedia wrote a file to when R2 was not
 * configured, or null if the key would escape the media dir.
 */
export function localMediaPath(key: string, mediaDir = process.env.WA_MEDIA_DIR || "./uploads"): string | null {
  const root = resolve(mediaDir);
  const full = resolve(join(root, key.replace(/^whatsapp\/[^/]+\//, "whatsapp/")));
  const rel = relative(root, full);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? full : null;
}

/** Draft state for the detail page, from DraftIntake.data.draftReview. */
export function draftReviewOf(d: any): WaRequestDetail["draftReview"] {
  const r = d?.draftReview;
  if (!r || typeof r !== "object") return null;
  const state = r.result === "approved" ? "approved" : r.result === "correction" ? "correction" : r.awaiting ? "sent" : "pending";
  return {
    state,
    sentAt: typeof r.sentAt === "string" ? r.sentAt : null,
    reply: typeof r.reply?.text === "string" ? r.reply.text : null,
    replyAt: typeof r.reply?.at === "string" ? r.reply.at : null,
  };
}
