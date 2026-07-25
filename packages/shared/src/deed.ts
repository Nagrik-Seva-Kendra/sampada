import { z } from "zod";
import { Role } from "./enums.js";

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

export const DeedRecordStatus = z.enum(["active", "inactive"]);
export type DeedRecordStatus = z.infer<typeof DeedRecordStatus>;

export const CreateSampleDeedInput = z.object({
  type: DeedType,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(40000).default(""),
});
export type CreateSampleDeedInput = z.infer<typeof CreateSampleDeedInput>;

export const UpdateSampleDeedInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().max(40000).optional(),
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
  createdByRole: Role.optional(),
  createdAt: z.string(),
});
export type SampleDeedItem = z.infer<typeof SampleDeedItem>;

/** Lightweight row for the "All Deeds" listing (drops the heavy content body). */
export const SampleDeedListItem = SampleDeedItem.omit({ content: true });
export type SampleDeedListItem = z.infer<typeof SampleDeedListItem>;

/** Server-side filters for the "All Deeds" management page. All fields optional/combinable. */
export const ListDeedsQuery = z.object({
  types: z
    .preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(DeedType))
    .optional(),
  status: DeedRecordStatus.optional(),
  createdById: z.string().trim().min(1).optional(),
  dateFrom: z.string().trim().min(1).optional(),
  dateTo: z.string().trim().min(1).optional(),
});
export type ListDeedsQuery = z.infer<typeof ListDeedsQuery>;

export const DeedCreator = z.object({
  id: z.string(),
  name: z.string(),
});
export type DeedCreator = z.infer<typeof DeedCreator>;

/** One row of a deed's saved-correction history (staff-only audit trail). */
export const DeedRevisionItem = z.object({
  id: z.string(),
  deedId: z.string(),
  versionNo: z.number(),
  title: z.string(),
  content: z.string(),
  status: DeedRecordStatus,
  editedById: z.string().nullable(),
  editedByName: z.string().nullable(),
  createdAt: z.string(),
});
export type DeedRevisionItem = z.infer<typeof DeedRevisionItem>;

/** Read-only shape served on the unauthenticated party-facing share link. */
export const PublicDeedItem = z.object({
  id: z.string(),
  type: DeedType,
  title: z.string(),
  content: z.string(),
  updatedAt: z.string(),
});
export type PublicDeedItem = z.infer<typeof PublicDeedItem>;

/**
 * A party's current text selection on the public share-link page, in plain
 * character offsets into the deed's content (end exclusive). `null` means
 * the selection was cleared (e.g. the party clicked elsewhere). Published by
 * the public page, relayed live to staff viewing the same deed.
 */
export const DeedSelectionInput = z.object({
  start: z.number().int().nonnegative().nullable(),
  end: z.number().int().nonnegative().nullable(),
});
export type DeedSelectionInput = z.infer<typeof DeedSelectionInput>;
