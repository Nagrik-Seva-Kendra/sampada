import { z } from "zod";
import { MemberStatus, OrgRole, OrgStatus } from "./enums.js";

/** Row shape for the platform-admin organizations list (Sampada management app). */
export const PlatformOrgSummary = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: OrgStatus,
  isPersonal: z.boolean(),
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type PlatformOrgSummary = z.infer<typeof PlatformOrgSummary>;

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
