-- Phase 2b — ownership transfer: owner nominates an admin, nominee confirms by link.
CREATE TABLE "OwnershipTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OwnershipTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OwnershipTransfer_tokenHash_key" ON "OwnershipTransfer"("tokenHash");
CREATE INDEX "OwnershipTransfer_organizationId_idx" ON "OwnershipTransfer"("organizationId");

-- Rollback (apply by hand; Prisma has no native down):
--   DROP TABLE "OwnershipTransfer";
