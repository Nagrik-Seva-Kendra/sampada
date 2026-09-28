-- WhatsApp automation: draft-intake conversations + webhook idempotency.
-- Additive only: two new tables, no changes to existing tables.

-- CreateTable
CREATE TABLE "DraftIntake" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "customerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "step" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "deed" JSONB,
    "documentKey" TEXT,
    "needsStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaInboundMessage" (
    "waMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaInboundMessage_pkey" PRIMARY KEY ("waMessageId")
);

-- CreateIndex
CREATE INDEX "DraftIntake_organizationId_phone_status_idx" ON "DraftIntake"("organizationId", "phone", "status");
