import { z } from "zod";

/** User roles — gates public site, partner portal, admin panel. */
export const Role = z.enum(["PUBLIC", "PARTNER", "ADMIN"]);
export type Role = z.infer<typeof Role>;

/** Top-level property categories (mapped from legacy include/*.form.php). */
export const PropertyType = z.enum([
  "AGRICULTURE",
  "BUILDING_INDEPENDENT",
  "BUILDING_MULTISTOREY",
  "PLOT",
  "OPEN_TERRACE",
]);
export type PropertyType = z.infer<typeof PropertyType>;

/** Sub-types available per property category. */
export const PropertySubType = z.enum([
  // agriculture
  "AGRI_DIVERTED",
  "AGRI_UNDIVERTED",
  "AGRI_DIVERTED_AND_UNDIVERTED",
  // independent building
  "COMMERCIAL",
  "RESIDENTIAL",
  "RESIDENTIAL_CUM_COMMERCIAL",
  "EDUCATION",
  "HEALTH",
  "INDUSTRIAL",
  "OTHER",
]);
export type PropertySubType = z.infer<typeof PropertySubType>;

/** Deed lifecycle status. */
export const DeedStatus = z.enum(["DRAFT", "ACTIVE", "INACTIVE", "COMPLETED"]);
export type DeedStatus = z.infer<typeof DeedStatus>;

/** Buyer / seller party categories (from partner/*_buyer|saler.php). */
export const PartyCategory = z.enum([
  "INDIVIDUAL",
  "ORGANIZATION",
  "GOV_OFFICIAL",
]);
export type PartyCategory = z.infer<typeof PartyCategory>;

/** Language for bilingual guideline content. */
export const Language = z.enum(["en", "hi"]);
export type Language = z.infer<typeof Language>;
