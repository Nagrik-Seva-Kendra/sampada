import { z } from "zod";

/** User roles — gates public site, employee portal, admin panel. */
export const Role = z.enum(["PUBLIC", "EMPLOYEE", "ADMIN"]);
export type Role = z.infer<typeof Role>;

/** Roles that log in via the staff login form (excludes PUBLIC). */
export const StaffRole = z.enum(["EMPLOYEE", "ADMIN"]);
export type StaffRole = z.infer<typeof StaffRole>;

/** A member's authorization level within an organization (tenant). Mirrors Prisma's OrgRole enum. */
export const OrgRole = z.enum(["OWNER", "ADMIN", "EMPLOYEE"]);
export type OrgRole = z.infer<typeof OrgRole>;

/** Lifecycle status of a Membership row. Mirrors Prisma's MemberStatus enum. */
export const MemberStatus = z.enum(["PENDING", "ACTIVE", "INACTIVE"]);
export type MemberStatus = z.infer<typeof MemberStatus>;

/** An organization's billing lifecycle. Mirrors Prisma's OrgStatus enum. */
export const OrgStatus = z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]);
export type OrgStatus = z.infer<typeof OrgStatus>;

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
