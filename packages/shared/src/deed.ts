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
