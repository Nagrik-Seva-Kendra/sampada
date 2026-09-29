/**
 * Pure mapping from DraftIntake rows to the web API shapes in
 * @sampada/shared (whatsapp-request.ts). Aadhaar/PAN only ever leave here masked;
 * the one exception is revealSecrets(), used by the OWNER/ADMIN-only endpoint.
 */
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  WaDeedParty,
  WaIntakeStatus,
  WaPropertySummary,
  WaRequestDetail,
  WaRequestListItem,
  WaRevealResult,
  WaWorkStatus,
} from "@sampada/shared";
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

const WORK_STATUSES = new Set(["NEW", "IN_PROGRESS", "DRAFT_READY", "DONE", "REJECTED"]);
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
    buyerName: str(d.buyerName),
    amount: num(d.amount),
    amountMode: mode,
    propertySummary: propertySummary(property(deed?.property)),
    assigneeName,
  };
}

/** canManage = OWNER/ADMIN: may reveal Aadhaar/PAN and change the assignee. */
export function toDetail(row: DraftIntakeRow, assigneeName: string | null, canManage: boolean): WaRequestDetail {
  const d = (row.data ?? {}) as Record<string, unknown>;
  const deed = (row.deed ?? null) as Record<string, unknown> | null;
  const tax = d.tax && typeof d.tax === "object" ? (d.tax as Record<string, unknown>) : null;
  const extra = Array.isArray(d.extraDocs) ? d.extraDocs.filter((k) => typeof k === "string") : [];
  const documents: WaRequestDetail["documents"] = [];
  if (row.documentKey) documents.push({ index: 0, label: "पुरानी रजिस्ट्री" });
  extra.forEach((_, i) => documents.push({ index: i + 1, label: `अतिरिक्त दस्तावेज़ ${i + 1}` }));

  return {
    ...toListItem(row, assigneeName),
    phone: row.phone,
    step: row.step,
    updatedAt: row.updatedAt.toISOString(),
    assigneeId: row.assigneeId,
    staffNote: row.staffNote,
    buyer: {
      name: str(d.buyerName),
      fatherName: str(d.buyerFatherName),
      motherName: str(d.buyerMotherName),
      mobile: str(d.buyerMobile),
      email: str(d.buyerEmail),
      address: str(d.buyerAddress),
      aadhaarMasked: maskSecret(d.buyerAadhaar),
      panMasked: maskSecret(d.buyerPan),
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
    documents,
    canReveal: canManage,
    canAssign: canManage,
  };
}

export function revealSecrets(row: DraftIntakeRow): WaRevealResult {
  const d = (row.data ?? {}) as Record<string, unknown>;
  return { aadhaar: revealSecret(d.buyerAadhaar), pan: revealSecret(d.buyerPan), sellerPan: revealSecret(d.sellerPan) };
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
