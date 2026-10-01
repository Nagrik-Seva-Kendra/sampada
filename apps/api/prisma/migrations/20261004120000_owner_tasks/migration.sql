-- Owner's WhatsApp to-do assistant (additive).
ALTER TABLE "WaContact" ADD COLUMN "ownerTestUntil" TIMESTAMP(3);

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "partyName" TEXT,
    "partyPhone" TEXT,
    "workType" TEXT NOT NULL DEFAULT 'other',
    "place" TEXT,
    "dueAt" TIMESTAMP(3),
    "note" TEXT,
    "source" TEXT NOT NULL,
    "transcript" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "linkedRequestId" TEXT,
    "createdById" TEXT,
    "broadcastId" TEXT,
    "remindedAt" TIMESTAMP(3),
    "outreachAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Task_organizationId_number_key" ON "Task"("organizationId", "number");
CREATE INDEX "Task_organizationId_status_dueAt_idx" ON "Task"("organizationId", "status", "dueAt");
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");
CREATE INDEX "Task_partyPhone_idx" ON "Task"("partyPhone");

CREATE TABLE "WaMediaDeletion" (
    "key" TEXT NOT NULL,
    "deleteAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaMediaDeletion_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "WaMediaDeletion_deleteAt_idx" ON "WaMediaDeletion"("deleteAt");

CREATE TABLE "WaJobRun" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaJobRun_pkey" PRIMARY KEY ("name")
);
