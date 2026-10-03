-- Customer copies of archive registries over WhatsApp. Additive only.
CREATE TABLE "ArchiveCopySetting" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArchiveCopySetting_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "ArchiveCopyRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "deedId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveCopyRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArchiveCopyRequest_organizationId_number_key" ON "ArchiveCopyRequest"("organizationId", "number");
CREATE INDEX "ArchiveCopyRequest_organizationId_status_idx" ON "ArchiveCopyRequest"("organizationId", "status");
CREATE INDEX "ArchiveCopyRequest_phone_createdAt_idx" ON "ArchiveCopyRequest"("phone", "createdAt");
