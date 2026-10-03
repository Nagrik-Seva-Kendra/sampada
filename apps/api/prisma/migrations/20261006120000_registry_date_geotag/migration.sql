-- Registry date (customer's choice + staff-confirmed) and geo-tag photo on WhatsApp requests. Additive only.
ALTER TABLE "DraftIntake" ADD COLUMN "preferredDate" TEXT;
ALTER TABLE "DraftIntake" ADD COLUMN "alternateDate" TEXT;
ALTER TABLE "DraftIntake" ADD COLUMN "timeOfDay" TEXT;
ALTER TABLE "DraftIntake" ADD COLUMN "geoTagMode" TEXT;
ALTER TABLE "DraftIntake" ADD COLUMN "registryDate" TEXT;
ALTER TABLE "DraftIntake" ADD COLUMN "registryTime" TEXT;
ALTER TABLE "DraftIntake" ADD COLUMN "registryReminderSentAt" TIMESTAMP(3);
ALTER TABLE "DraftIntake" ADD COLUMN "geoTagPhotos" INTEGER;
ALTER TABLE "DraftIntake" ADD COLUMN "geoTagTakenAt" TIMESTAMP(3);

CREATE INDEX "DraftIntake_organizationId_registryDate_idx" ON "DraftIntake"("organizationId", "registryDate");
