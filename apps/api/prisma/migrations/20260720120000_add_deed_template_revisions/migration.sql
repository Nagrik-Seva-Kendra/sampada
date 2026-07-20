-- CreateTable
CREATE TABLE "DeedTemplateRevision" (
    "id" TEXT NOT NULL,
    "deedId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "editedById" TEXT,
    "editedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeedTemplateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeedTemplateRevision_deedId_idx" ON "DeedTemplateRevision"("deedId");

-- CreateIndex
CREATE UNIQUE INDEX "DeedTemplateRevision_deedId_versionNo_key" ON "DeedTemplateRevision"("deedId", "versionNo");
