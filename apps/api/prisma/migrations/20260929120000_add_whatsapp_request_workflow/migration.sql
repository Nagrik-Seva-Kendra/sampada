-- WhatsApp draft requests: office workflow fields for the web "WhatsApp अनुरोध" page.
-- Additive only: three nullable columns + one index on DraftIntake.

-- AlterTable
ALTER TABLE "DraftIntake" ADD COLUMN "workStatus" TEXT,
ADD COLUMN "assigneeId" TEXT,
ADD COLUMN "staffNote" TEXT;

-- Requests submitted before this migration are waiting for the office.
UPDATE "DraftIntake" SET "workStatus" = 'NEW' WHERE "status" = 'SUBMITTED' AND "workStatus" IS NULL;

-- CreateIndex
CREATE INDEX "DraftIntake_organizationId_workStatus_idx" ON "DraftIntake"("organizationId", "workStatus");
