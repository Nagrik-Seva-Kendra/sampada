-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EMPLOYEE';

-- CreateTable
CREATE TABLE "DeedTemplate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeedTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeedTemplate_type_idx" ON "DeedTemplate"("type");

-- CreateIndex
CREATE INDEX "DeedTemplate_createdById_idx" ON "DeedTemplate"("createdById");
