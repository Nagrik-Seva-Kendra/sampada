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
  /**
   * What the onboarding wizard asked before the account existed: what they do,
   * what they came for, and where they work. All optional — every one of them
   * can be skipped, and none of them may stand between someone and an
   * account. They personalise the first-run checklist; the district also
   * points it at the right guideline rates.
   */
  onboardingRole: z.string().trim().max(40).optional(),
  onboardingGoal: z.string().trim().max(40).optional(),
  district: z.string().trim().max(80).optional(),
});
export type OrgSignupInput = z.infer<typeof OrgSignupInput>;

/** The org a session is acting under, plus the caller's role in it. */
export const OrganizationSummary = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: OrgStatus,
  role: OrgRole,
  /** Where this partner works, from onboarding. Null until they say. */
  district: z.string().nullable().default(null),
});
export type OrganizationSummary = z.infer<typeof OrganizationSummary>;
