/**
 * Pure invariant checks for membership changes, free of any @prisma/client
 * import (mirrors prisma/tenant-scope.core.ts). Phase 2b's remove/demote/
 * self-demote endpoints call this — only when the membership being changed is
 * itself an ACTIVE OWNER; calling it for any other membership is a caller bug,
 * not something this function detects (it has no membership shape to check).
 */
export class LastOwnerViolationError extends Error {
  constructor(message = "An organization must always keep at least one active owner.") {
    super(message);
    this.name = "LastOwnerViolationError";
  }
}

/**
 * @param activeOwnerCount Count of ACTIVE memberships with role OWNER in the
 *   target org, INCLUDING the one about to be removed/demoted/deactivated.
 * @throws LastOwnerViolationError if that count is <= 1 (the change would leave zero).
 */
export function assertNotLastActiveOwner(activeOwnerCount: number): void {
  if (activeOwnerCount <= 1) throw new LastOwnerViolationError();
}
