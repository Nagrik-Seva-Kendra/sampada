-- AlterTable
ALTER TABLE "DeedArchiveIndex" ADD COLUMN     "manualType" TEXT,
ADD COLUMN     "rulesVersion" INTEGER NOT NULL DEFAULT 1;

