import { z } from "zod";
import { OrgRole, OrgStatus } from "./enums.js";

/** Self-serve org signup: creates a new Organization + its founding Owner, logged in immediately. */
export const OrgSignupInput = z.object({
  orgName: z.string().trim().min(2).max(200),
  fname: z.string().trim().min(1).max(100),
  lname: z.string().trim().min(1).max(100),
  email: z.string().email(),
  phone: z.string().trim().regex(/^[0-9]{10}$/, "Enter a valid 10-digit mobile number").optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, underscore, hyphen only")
    .optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  emailOtp: z.string().trim().length(6, "Enter the 6-digit code"),
});
export type OrgSignupInput = z.infer<typeof OrgSignupInput>;

/** Authenticated: create an ADDITIONAL org for the already-logged-in user. */
export const CreateOrganizationInput = z.object({
  name: z.string().trim().min(2).max(200),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationInput>;

/** Authenticated: switch which org the session acts under. */
export const SwitchOrganizationInput = z.object({
  organizationId: z.string().min(1),
});
export type SwitchOrganizationInput = z.infer<typeof SwitchOrganizationInput>;

/** One row of the workspace switcher — an org the caller belongs to, plus their role in it. */
export const OrganizationSummary = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: OrgStatus,
  role: OrgRole,
});
export type OrganizationSummary = z.infer<typeof OrganizationSummary>;
