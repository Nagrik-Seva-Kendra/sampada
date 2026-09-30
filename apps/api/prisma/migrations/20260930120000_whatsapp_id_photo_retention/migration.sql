-- ID-card photo retention for WhatsApp requests (additive).
ALTER TABLE "DraftIntake" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "DraftIntake" ADD COLUMN "idPhotosPurgedAt" TIMESTAMP(3);
CREATE INDEX "DraftIntake_closedAt_idx" ON "DraftIntake"("closedAt");

-- Requests already closed count from their last update.
UPDATE "DraftIntake" SET "closedAt" = "updatedAt" WHERE "workStatus" IN ('DONE', 'REJECTED') AND "closedAt" IS NULL;
