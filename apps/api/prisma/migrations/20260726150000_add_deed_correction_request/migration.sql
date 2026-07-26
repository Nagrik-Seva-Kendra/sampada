-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'RESOLVED');

-- A correction a party flags via the public share link ("/d/:id"), scoped to
-- the same org as the deed it's attached to.
CREATE TABLE "DeedCorrectionRequest" (
    "id" TEXT NOT NULL,
    "deedTemplateId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeedCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeedCorrectionRequest_deedTemplateId_status_idx" ON "DeedCorrectionRequest"("deedTemplateId", "status");
CREATE INDEX "DeedCorrectionRequest_organizationId_status_idx" ON "DeedCorrectionRequest"("organizationId", "status");

ALTER TABLE "DeedCorrectionRequest" ADD CONSTRAINT "DeedCorrectionRequest_deedTemplateId_fkey" FOREIGN KEY ("deedTemplateId") REFERENCES "DeedTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeedCorrectionRequest" ADD CONSTRAINT "DeedCorrectionRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeedCorrectionRequest" ADD CONSTRAINT "DeedCorrectionRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (apply by hand; Prisma has no native down):
--   DROP TABLE "DeedCorrectionRequest";
--   DROP TYPE "CorrectionStatus";
