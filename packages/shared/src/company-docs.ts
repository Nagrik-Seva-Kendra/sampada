import { z } from "zod";

/** Kind of document filed under a site (property/project). */
export const CompanyDocCategory = z.enum([
  "town-country-planning",
  "nagar-nigam",
  "aadhar-card",
  "pan-card",
  "layout",
  "old-registry",
  "other",
]);
export type CompanyDocCategory = z.infer<typeof CompanyDocCategory>;

/** Admin creates a site (property/project) to file documents under. */
export const CreateSiteInput = z.object({
  name: z.string().trim().min(1).max(150),
});
export type CreateSiteInput = z.infer<typeof CreateSiteInput>;

export const SiteItem = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  docCount: z.number().int(),
});
export type SiteItem = z.infer<typeof SiteItem>;

export const CompanyDocItem = z.object({
  id: z.string(),
  siteId: z.string(),
  category: CompanyDocCategory,
  /** Free-text description, e.g. "TCP permission — Phase 2". */
  label: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: z.string(), // ISO timestamp
  url: z.string(),
});
export type CompanyDocItem = z.infer<typeof CompanyDocItem>;
