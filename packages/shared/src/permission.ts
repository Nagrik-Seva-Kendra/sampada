import { z } from "zod";
import { OrgRole } from "./enums.js";

/**
 * Actions gated by org role. Namespaced "<resource>.<action>" to keep the
 * matrix scannable. Not yet consumed by any endpoint — Phase 2b's member
 * management routes are the first real callers.
 */
export const Permission = z.enum([
  "members.invite",
  "members.directCreate",
  "members.remove",
  "members.roleChange",
  "members.approveJoinRequest",
  "org.settingsManage",
  "org.ownershipTransfer",
  "org.delete",
  "billing.manage",
]);
export type Permission = z.infer<typeof Permission>;

/** OWNER: everything. ADMIN: full member management + org settings, not ownership transfer or billing. EMPLOYEE: none. */
export const ORG_ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  OWNER: Permission.options,
  ADMIN: [
    "members.invite",
    "members.directCreate",
    "members.remove",
    "members.roleChange",
    "members.approveJoinRequest",
    "org.settingsManage",
  ],
  EMPLOYEE: [],
};

/** Pure lookup — no I/O. Keeps the matrix in one place for both the guard and future invariant checks. */
export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return ORG_ROLE_PERMISSIONS[role].includes(permission);
}
