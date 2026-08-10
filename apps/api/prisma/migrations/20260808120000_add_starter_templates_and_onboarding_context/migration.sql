-- Starter deed templates (copied into every new workspace at onboarding) and
-- the onboarding answers the wizard used to discard.
--
-- Additive only: every column is nullable or defaulted, so the running API
-- keeps working before it is redeployed.
-- to undo:
--   DROP INDEX "DeedTemplate_isStarter_idx";
--   ALTER TABLE "DeedTemplate" DROP COLUMN "isStarter";
--   ALTER TABLE "Organization" DROP COLUMN "onboardingRole",
--     DROP COLUMN "onboardingGoal", DROP COLUMN "district";

-- AlterTable
ALTER TABLE "DeedTemplate" ADD COLUMN "isStarter" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "onboardingRole" TEXT,
  ADD COLUMN "onboardingGoal" TEXT,
  ADD COLUMN "district" TEXT;

-- CreateIndex
CREATE INDEX "DeedTemplate_isStarter_idx" ON "DeedTemplate"("isStarter");
