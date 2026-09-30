/**
 * Every stored file of one WhatsApp request (pure; wa-request-delete.spec.ts):
 * the first document, extra documents, mortgage papers, ID-card photos
 * (including blurry retries), and the draft PDFs sent to the customer.
 * Only keys under "whatsapp/" -- never anything else in the bucket.
 */
import { idPhotoKeys } from "./id-photo-retention.service.js";

export function requestMediaKeys(row: { documentKey: string | null; data: unknown }, notificationTemplates: unknown[] = []): string[] {
  const d = (row.data ?? {}) as any;
  const keys = new Set<string>();
  const add = (k: unknown) => {
    if (typeof k === "string" && k.startsWith("whatsapp/") && !k.includes("..")) keys.add(k);
  };
  add(row.documentKey);
  for (const k of Array.isArray(d.extraDocs) ? d.extraDocs : []) add(k);
  for (const k of Object.values(d.docs ?? {})) add(k);
  for (const k of idPhotoKeys(d)) add(k);
  add(d.draftReview?.key);
  for (const t of notificationTemplates) add((t as any)?.document?.key);
  return [...keys];
}
