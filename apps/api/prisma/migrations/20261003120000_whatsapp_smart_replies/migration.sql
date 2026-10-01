-- WhatsApp front door: menu state, gibberish/spam handling, office fee table (additive).
ALTER TABLE "WaContact" ADD COLUMN "organizationId" TEXT,
ADD COLUMN "state" JSONB,
ADD COLUMN "gibberishStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mutedUntil" TIMESTAMP(3),
ADD COLUMN "blockedAt" TIMESTAMP(3),
ADD COLUMN "blockReason" TEXT,
ADD COLUMN "recentReplies" JSONB;

CREATE INDEX "WaContact_organizationId_blockedAt_idx" ON "WaContact"("organizationId", "blockedAt");

CREATE TABLE "WaOfficeFeeConfig" (
    "organizationId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaOfficeFeeConfig_pkey" PRIMARY KEY ("organizationId")
);
