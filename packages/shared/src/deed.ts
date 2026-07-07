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

export const CreateDeedInput = z.object({
  type: DeedType,
  /** Short label, e.g. parties or property: "Ram Kumar → Shyam Lal, Morar plot". */
  title: z.string().trim().min(1).max(200),
  district: z.string().trim().max(80).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
});
export type CreateDeedInput = z.infer<typeof CreateDeedInput>;

export const UpdateDeedInput = z.object({
  type: DeedType.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  district: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type UpdateDeedInput = z.infer<typeof UpdateDeedInput>;

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

/** A deed record. Visibility: creator always; ADMIN sees partners' deeds too. */
export const DeedRecordItem = z.object({
  id: z.string(),
  type: DeedType,
  title: z.string(),
  district: z.string(),
  notes: z.string(),
  createdById: z.string(),
  createdByName: z.string(),
  createdByRole: Role,
  createdAt: z.string(), // ISO timestamp
});
export type DeedRecordItem = z.infer<typeof DeedRecordItem>;
