-- Customer satisfaction (ratings, feedback, corrections, packet) + settings. Additive only.
ALTER TABLE "DraftIntake" ADD COLUMN "rating" INTEGER;
ALTER TABLE "DraftIntake" ADD COLUMN "ratingAt" TIMESTAMP(3);
ALTER TABLE "DraftIntake" ADD COLUMN "ratingAskedAt" TIMESTAMP(3);
ALTER TABLE "DraftIntake" ADD COLUMN "feedback" TEXT;
ALTER TABLE "DraftIntake" ADD COLUMN "corrections" JSONB;
ALTER TABLE "DraftIntake" ADD COLUMN "packetSentAt" TIMESTAMP(3);

CREATE TABLE "SatisfactionConfig" (
    "organizationId" TEXT NOT NULL,
    "reviewUrl" TEXT NOT NULL DEFAULT '',
    "correctionPolicy" TEXT NOT NULL,
    "ratingDelayHours" INTEGER NOT NULL DEFAULT 24,
    "ratingsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SatisfactionConfig_pkey" PRIMARY KEY ("organizationId")
);
