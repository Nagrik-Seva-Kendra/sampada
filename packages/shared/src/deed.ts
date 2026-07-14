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
  createdAt: z.string(), // ISO timestamp
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
  // Inclusive date-range filter on createdAt, sent as "YYYY-MM-DD" (from a
  // native <input type="date">). Kept as plain strings here — the API parses
  // them to Date and applies day-boundary bounds.
  dateFrom: z.string().trim().min(1).optional(),
  dateTo: z.string().trim().min(1).optional(),
});
export type ListDeedsQuery = z.infer<typeof ListDeedsQuery>;

export const DeedCreator = z.object({
  id: z.string(),
  name: z.string(),
});
export type DeedCreator = z.infer<typeof DeedCreator>;
