-- AI draft from the office archive. Additive only.
ALTER TABLE "DeedTemplate" ADD COLUMN "aiDraftStatus" TEXT;

CREATE TABLE "DeedArchiveIndex" (
    "deedId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deedType" TEXT NOT NULL,
    "propertyType" TEXT,
    "colony" TEXT,
    "village" TEXT,
    "ward" TEXT,
    "tehsil" TEXT,
    "district" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "indexedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeedArchiveIndex_pkey" PRIMARY KEY ("deedId")
);
CREATE INDEX "DeedArchiveIndex_organizationId_deedType_propertyType_idx" ON "DeedArchiveIndex"("organizationId", "deedType", "propertyType");

CREATE TABLE "AiDraftConfig" (
    "organizationId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiDraftConfig_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "AiDraftRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "draftIntakeId" TEXT NOT NULL,
    "deedId" TEXT,
    "deedType" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "examples" JSONB NOT NULL DEFAULT '[]',
    "issues" JSONB NOT NULL DEFAULT '[]',
    "reviewIssues" JSONB NOT NULL DEFAULT '[]',
    "flags" JSONB NOT NULL DEFAULT '[]',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiDraftRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiDraftRun_draftIntakeId_idx" ON "AiDraftRun"("draftIntakeId");
CREATE INDEX "AiDraftRun_organizationId_createdAt_idx" ON "AiDraftRun"("organizationId", "createdAt");

CREATE TABLE "AiEvalRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deedType" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "AiEvalRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiEvalRun_organizationId_propertyType_startedAt_idx" ON "AiEvalRun"("organizationId", "propertyType", "startedAt");
