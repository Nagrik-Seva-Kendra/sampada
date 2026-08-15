import { z } from "zod";
import { MemberStatus, OrgRole, OrgStatus } from "./enums.js";

/** Row shape for the platform-admin organizations list (Sampada management app). */
export const PlatformOrgSummary = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: OrgStatus,
  isPersonal: z.boolean(),
  /** Where the partner works, from onboarding. Null for anyone who signed up before it was asked. */
  district: z.string().nullable(),
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type PlatformOrgSummary = z.infer<typeof PlatformOrgSummary>;

/** Districts that actually have partners, with how many — drives the filter control. */
export const PlatformDistrictCount = z.object({
  district: z.string(),
  count: z.number().int(),
});
export type PlatformDistrictCount = z.infer<typeof PlatformDistrictCount>;

export const PlatformOrgMember = z.object({
  membershipId: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: OrgRole,
  status: MemberStatus,
  mobile: z.string().nullable(),
  employeeCode: z.string().nullable(),
  createdAt: z.string(),
});
export type PlatformOrgMember = z.infer<typeof PlatformOrgMember>;

export const PlatformOrgDetail = PlatformOrgSummary.omit({ memberCount: true }).extend({
  joinCode: z.string(),
  /**
   * What the founder told the onboarding wizard: where they work, what they
   * do, and what they came for. Null for anyone who signed up before the
   * wizard started keeping the answers, or who skipped the question.
   */
  district: z.string().nullable(),
  onboardingRole: z.string().nullable(),
  onboardingGoal: z.string().nullable(),
  /** Enough to tell a workspace that is being used from one that never was. */
  deedCount: z.number().int(),
  lastDeedAt: z.string().nullable(),
  members: z.array(PlatformOrgMember),
});
export type PlatformOrgDetail = z.infer<typeof PlatformOrgDetail>;

export const PlatformUpdateMembershipInput = z.object({
  role: OrgRole.optional(),
  status: MemberStatus.optional(),
});
export type PlatformUpdateMembershipInput = z.infer<typeof PlatformUpdateMembershipInput>;
