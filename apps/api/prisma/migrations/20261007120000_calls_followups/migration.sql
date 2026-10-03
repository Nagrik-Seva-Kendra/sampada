-- Call-back requests and follow-up reminders. Additive only.
ALTER TABLE "DraftIntake" ADD COLUMN "followUpKind" TEXT;
ALTER TABLE "DraftIntake" ADD COLUMN "termEndDate" TEXT;
ALTER TABLE "WaContact" ADD COLUMN "followUpOptOutAt" TIMESTAMP(3);

CREATE TABLE "CallbackRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "customerName" TEXT,
    "preferredAt" TIMESTAMP(3),
    "preferredText" TEXT,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "assigneeId" TEXT,
    "draftIntakeId" TEXT,
    "doneNote" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallbackRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CallbackRequest_organizationId_number_key" ON "CallbackRequest"("organizationId", "number");
CREATE INDEX "CallbackRequest_organizationId_status_idx" ON "CallbackRequest"("organizationId", "status");

CREATE TABLE "FollowUpRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "offsetDays" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "FollowUpRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FollowUpRule_organizationId_kind_key" ON "FollowUpRule"("organizationId", "kind");

CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "draftIntakeId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FollowUp_organizationId_status_dueDate_idx" ON "FollowUp"("organizationId", "status", "dueDate");
CREATE INDEX "FollowUp_draftIntakeId_idx" ON "FollowUp"("draftIntakeId");
CREATE INDEX "FollowUp_phone_status_idx" ON "FollowUp"("phone", "status");
