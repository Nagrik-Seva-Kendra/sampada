-- AI draft learning from staff edits. Additive only.
ALTER TABLE "AiDraftRun" ADD COLUMN "originalEnc" TEXT;
ALTER TABLE "AiDraftRun" ADD COLUMN "editRatio" DOUBLE PRECISION;
ALTER TABLE "AiDraftRun" ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE TABLE "AiLearnedRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deedType" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "AiLearnedRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiLearnedRule_organizationId_deedType_before_after_key" ON "AiLearnedRule"("organizationId", "deedType", "before", "after");
CREATE INDEX "AiLearnedRule_organizationId_status_idx" ON "AiLearnedRule"("organizationId", "status");
