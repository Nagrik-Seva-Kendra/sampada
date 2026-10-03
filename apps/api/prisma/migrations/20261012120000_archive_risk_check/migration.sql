-- Property index of archive deeds for the risk check. Additive only.
CREATE TABLE "PropertyIndexEntry" (
    "deedId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deedType" TEXT NOT NULL,
    "number" TEXT,
    "colony" TEXT,
    "village" TEXT,
    "ward" TEXT,
    "tehsil" TEXT,
    "district" TEXT,
    "sellers" JSONB NOT NULL DEFAULT '[]',
    "buyers" JSONB NOT NULL DEFAULT '[]',
    "deedDate" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PropertyIndexEntry_pkey" PRIMARY KEY ("deedId")
);
CREATE INDEX "PropertyIndexEntry_organizationId_number_idx" ON "PropertyIndexEntry"("organizationId", "number");
