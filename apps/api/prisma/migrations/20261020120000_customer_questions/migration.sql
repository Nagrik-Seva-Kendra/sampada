-- CreateTable
CREATE TABLE "WaQuestion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaLearnedAnswer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keys" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaLearnedAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaQuestion_organizationId_status_idx" ON "WaQuestion"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WaQuestion_organizationId_number_key" ON "WaQuestion"("organizationId", "number");

-- CreateIndex
CREATE INDEX "WaLearnedAnswer_organizationId_enabled_idx" ON "WaLearnedAnswer"("organizationId", "enabled");

