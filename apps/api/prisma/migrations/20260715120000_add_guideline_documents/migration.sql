-- CreateTable
CREATE TABLE "GuidelineDocument" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "size" INTEGER NOT NULL,
      "data" BYTEA NOT NULL,
      "uploadedById" TEXT,
      "uploadedByName" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuidelineDocument_pkey" PRIMARY KEY ("id")
  );

-- CreateIndex
CREATE INDEX "GuidelineDocument_createdAt_idx" ON "GuidelineDocument"("createdAt");
