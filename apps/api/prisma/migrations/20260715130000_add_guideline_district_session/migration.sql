-- AlterTable
ALTER TABLE "GuidelineDocument" ADD COLUMN     "district" TEXT NOT NULL,
ADD COLUMN     "session" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "GuidelineDocument_district_session_idx" ON "GuidelineDocument"("district", "session");
