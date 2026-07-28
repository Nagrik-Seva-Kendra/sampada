import { z } from "zod";

/** Length unit for a plot's E-W / N-S measurements. */
export const LengthUnit = z.enum(["ft", "m"]);
export type LengthUnit = z.infer<typeof LengthUnit>;

/** Area unit for the optional stated-in-document area figure. */
export const AreaUnit = z.enum(["sqft", "sqm"]);
export type AreaUnit = z.infer<typeof AreaUnit>;

/** Chauhaddi (four boundaries) of a plot, as free text per side. */
export const BoundarySchema = z.object({
  north: z.string().trim().min(1, "Enter the northern boundary"),
  south: z.string().trim().min(1, "Enter the southern boundary"),
  east: z.string().trim().min(1, "Enter the eastern boundary"),
  west: z.string().trim().min(1, "Enter the western boundary"),
});
export type BoundarySchema = z.infer<typeof BoundarySchema>;

/**
 * Structured property data attached to a deed, used to both render deed text
 * (plot no., boundaries) and auto-generate the naksha (site plan) drawing
 * from the same source of truth. Only rectangle/square plots are supported
 * today. Field names are direction-based (ewLength/nsLength), not
 * length/width, so the naksha orientation is never ambiguous — "Length"/
 * "Breadth" is only the form's human-facing label for these two fields.
 * `location` is one free-text address block (colony, village, patwari
 * halka, district, etc. all together) rather than separate fields — deeds
 * phrase this differently enough that splitting it added more form fields
 * than it saved. `plotNo` is optional: not every property has one.
 * `sellerName`/`buyerName` are read from the deed's own text (its "विक्रेता
 * पक्ष"/"क्रेता पक्ष" lines), not from the separate Party/DeedParty records,
 * since the deed text is the authoritative naming format for the naksha.
 */
const DeedPropertyDetailFields = {
  plotNo: z.string().trim().optional(),
  block: z.string().trim().optional(),
  location: z.string().trim().min(1, "Enter the location"),
  sellerName: z.string().trim().optional(),
  buyerName: z.string().trim().optional(),

  shape: z.literal("rectangle").default("rectangle"),
  ewLength: z.number().positive("Length must be greater than 0"),
  nsLength: z.number().positive("Breadth must be greater than 0"),
  unit: LengthUnit,

  statedArea: z.number().positive().optional(),
  statedAreaUnit: AreaUnit.optional(),

  boundaries: BoundarySchema,
};

export const DeedPropertyDetailCreateInput = z.object(DeedPropertyDetailFields);
export type DeedPropertyDetailCreateInput = z.infer<typeof DeedPropertyDetailCreateInput>;

export const DeedPropertyDetailUpdateInput = z.object({
  ...Object.fromEntries(Object.entries(DeedPropertyDetailFields).map(([k, v]) => [k, v.optional()])),
}) as z.ZodType<Partial<DeedPropertyDetailCreateInput>>;
export type DeedPropertyDetailUpdateInput = z.infer<typeof DeedPropertyDetailUpdateInput>;

/** Full detail shape returned by the API — Create fields plus server-assigned audit metadata. */
export const DeedPropertyDetail = DeedPropertyDetailCreateInput.extend({
  id: z.string(),
  deedId: z.string(),
  source: z.enum(["manual", "extracted"]),
  verifiedAt: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DeedPropertyDetail = z.infer<typeof DeedPropertyDetail>;

/**
 * A best-effort reading of a deed's existing free-text content, produced by
 * an LLM (see DeedPropertyDetailService.extractFromDeedText) rather than
 * regex — deed phrasing varies too much across authors/eras for pattern
 * matching to hold up, but an LLM reading the text like a person would
 * handles that variation without needing a new rule for every phrasing.
 * Every field is nullable: the model is instructed to use null rather than
 * guess when something isn't clearly stated. Never auto-saved — this only
 * pre-fills the deed property-detail form for a human to review and correct.
 */
export const DeedPropertyDetailExtraction = z.object({
  plotNo: z.string().trim().min(1).nullable(),
  block: z.string().trim().min(1).nullable(),
  location: z.string().trim().min(1).nullable(),
  sellerName: z.string().trim().min(1).nullable(),
  buyerName: z.string().trim().min(1).nullable(),
  statedArea: z.number().positive().nullable(),
  statedAreaUnit: AreaUnit.nullable(),
  ewLength: z.number().positive().nullable(),
  nsLength: z.number().positive().nullable(),
  unit: LengthUnit.nullable(),
  boundaries: z.object({
    north: z.string().trim().min(1).nullable(),
    south: z.string().trim().min(1).nullable(),
    east: z.string().trim().min(1).nullable(),
    west: z.string().trim().min(1).nullable(),
  }),
});
export type DeedPropertyDetailExtraction = z.infer<typeof DeedPropertyDetailExtraction>;
