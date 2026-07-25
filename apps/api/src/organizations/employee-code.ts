import type { Prisma } from "@prisma/client";

/**
 * Sequential "EMP-0007"-style code, scoped per organization: atomically
 * increments Organization.nextEmployeeCode and returns the pre-increment
 * value, so concurrent joins in the same org can never collide and each
 * org starts its own numbering at EMP-0001 independent of any other org.
 */
export async function nextEmployeeCodeTx(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
  const org = await tx.organization.update({
    where: { id: organizationId },
    data: { nextEmployeeCode: { increment: 1 } },
    select: { nextEmployeeCode: true },
  });
  return `EMP-${String(org.nextEmployeeCode - 1).padStart(4, "0")}`;
}
