import { z } from "zod";

/**
 * Sale-listing category for the public property website (plots/villas/flats/
 * agricultural land). Distinct from the legacy `PropertyType`/`PropertySubType`
 * enums in enums.ts, which classify land for e-registry guideline-rate purposes
 * and are unrelated to this sales-listing domain.
 */
export const PropertyCategory = z.enum(["PLOT", "VILLA", "FLAT", "AGRICULTURAL_LAND"]);
export type PropertyCategory = z.infer<typeof PropertyCategory>;

/** DRAFT: staff-only, not shown on the public site. PUBLISHED: live. ARCHIVED: taken down, kept for records. */
export const PropertyStatus = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type PropertyStatus = z.infer<typeof PropertyStatus>;

export const PropertyImageSummary = z.object({
  id: z.string(),
  sortOrder: z.number().int(),
});
export type PropertyImageSummary = z.infer<typeof PropertyImageSummary>;

const PropertyFields = {
  title: z.string().trim().min(2).max(200),
  category: PropertyCategory,
  description: z.string().trim().max(5000).optional(),
  addressLine: z.string().trim().min(2).max(300),
  city: z.string().trim().min(1).max(120),
  district: z.string().trim().max(120).optional(),
  state: z.string().trim().min(1).max(120).optional(),
  pincode: z.string().trim().max(12).optional(),
  areaValue: z.coerce.number().positive().optional(),
  areaUnit: z.string().trim().max(20).optional(),
  priceValue: z.coerce.number().positive().optional(),
  priceLabel: z.string().trim().max(80).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, "Enter a valid 10-digit mobile number")
    .optional(),
};

export const PropertyCreateInput = z.object(PropertyFields);
export type PropertyCreateInput = z.infer<typeof PropertyCreateInput>;

export const PropertyUpdateInput = z.object({
  ...Object.fromEntries(Object.entries(PropertyFields).map(([k, v]) => [k, v.optional()])),
  status: PropertyStatus.optional(),
}) as z.ZodType<Partial<PropertyCreateInput> & { status?: PropertyStatus }>;
export type PropertyUpdateInput = z.infer<typeof PropertyUpdateInput>;

/** Row shape for the public listing grid and the staff management table. */
export const PropertySummary = z.object({
  id: z.string(),
  title: z.string(),
  category: PropertyCategory,
  city: z.string(),
  state: z.string(),
  areaValue: z.number().nullable(),
  areaUnit: z.string().nullable(),
  priceValue: z.number().nullable(),
  priceLabel: z.string().nullable(),
  status: PropertyStatus,
  coverImageId: z.string().nullable(),
  createdAt: z.string(),
});
export type PropertySummary = z.infer<typeof PropertySummary>;

/** Full detail shape for a property's page (public detail view + staff edit form). */
export const PropertyDetail = PropertySummary.extend({
  description: z.string().nullable(),
  addressLine: z.string(),
  district: z.string().nullable(),
  pincode: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  images: z.array(PropertyImageSummary),
});
export type PropertyDetail = z.infer<typeof PropertyDetail>;
