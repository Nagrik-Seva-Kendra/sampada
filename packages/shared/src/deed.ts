import { z } from "zod";
import { Role } from "./enums.js";

/** Instrument categories, as on the SAMPADA portal (slugs match web routes). */
export const DeedType = z.enum([
  "sale-deed",
  "release-deed",
  "partition-deed",
  "equitable-mortgage-deed",
  "lease-deed",
  "power-of-attorney",
  "will-deed",
  "gift-deed",
  "agreement",
  "reconveyance-deed",
  "amendment-deed",
]);
export type DeedType = z.infer<typeof DeedType>;

/** Admin-drafted deed shown on the public deed-type info page (view/print only). */
export const DeedRecordStatus = z.enum(["active", "inactive"]);
export type DeedRecordStatus = z.infer<typeof DeedRecordStatus>;

export const CreateSampleDeedInput = z.object({
  type: DeedType,
  title: z.string().trim().min(1).max(200),
  // Blank when first drafted; filled in on the edit page afterward.
  content: z.string().trim().max(40000).default(""),
});
export type CreateSampleDeedInput = z.infer<typeof CreateSampleDeedInput>;

export const UpdateSampleDeedInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(40000).optional(),
  status: DeedRecordStatus.optional(),
});
export type UpdateSampleDeedInput = z.infer<typeof UpdateSampleDeedInput>;

export const SampleDeedItem = z.object({
  id: z.string(),
  type: DeedType,
  title: z.string(),
  content: z.string(),
  status: DeedRecordStatus,
  createdById: z.string(),
  createdByName: z.string(),
  // Optional: absent on records drafted before this field existed.
  createdByRole: Role.optional(),
  createdAt: z.string(), // ISO timestamp
});
export type SampleDeedItem = z.infer<typeof SampleDeedItem>;

/** Lightweight row for the "All Deeds" listing (drops the heavy content body). */
export const SampleDeedListItem = SampleDeedItem.omit({ content: true });
export type SampleDeedListItem = z.infer<typeof SampleDeedListItem>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Server-side filters for the "All Deeds" management page. All fields optional/combinable. */
export const ListDeedsQuery = z.object({
  types: z
    .preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(DeedType))
    .optional(),
  status: DeedRecordStatus.optional(),
  createdById: z.string().trim().min(1).optional(),
  /** Inclusive, by createdAt date (not time). */
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});
export type ListDeedsQuery = z.infer<typeof ListDeedsQuery>;

/** One entry in the "All Deeds" creator filter dropdown. */
export const DeedCreator = z.object({
  id: z.string(),
  name: z.string(),
});
export type DeedCreator = z.infer<typeof DeedCreator>;
