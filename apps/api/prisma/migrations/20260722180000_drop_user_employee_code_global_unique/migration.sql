-- Phase 2b, slice 1 (org signup + join-by-org-code) — User.employeeCode was
-- globally unique, a leftover from before Organization existed (when the only
-- org meant global uniqueness == per-org uniqueness). Membership.employeeCode
-- already has the correct scoping (@@unique([organizationId, employeeCode])).
-- Now that a second org's employees can get "EMP-0001" too, the global
-- constraint on User collides across orgs. Drop it; per-org uniqueness is
-- enforced by the Membership constraint instead.
DROP INDEX "User_employeeCode_key";
