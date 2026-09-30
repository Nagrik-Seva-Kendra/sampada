-- WhatsApp status notifications to customers (additive).
CREATE TABLE "WaContact" (
    "phone" TEXT NOT NULL,
    "lastInboundAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("phone")
);

CREATE TABLE "WaNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "draftIntakeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "via" TEXT,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "template" JSONB,
    "reason" TEXT,
    "wamid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "WaNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaNotification_draftIntakeId_createdAt_idx" ON "WaNotification"("draftIntakeId", "createdAt");
