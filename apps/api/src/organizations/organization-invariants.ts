import { assertNotLastActiveOwner } from "./organization-invariants.core.js";

/** Narrow shape so this works identically with the main Prisma client or a $transaction's tx. */
interface OwnerCountClient {
  membership: {
    count(args: { where: { organizationId: string; role: "OWNER"; status: "ACTIVE" } }): Promise<number>;
  };
}

/** Throws LastOwnerViolationError if organizationId would be left with zero ACTIVE OWNER memberships. */
export async function assertOrgKeepsActiveOwner(client: OwnerCountClient, organizationId: string): Promise<void> {
  const count = await client.membership.count({ where: { organizationId, role: "OWNER", status: "ACTIVE" } });
  assertNotLastActiveOwner(count);
}
