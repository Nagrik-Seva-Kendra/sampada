-- Add PAN card + company-party support to Party.
-- Aadhaar fields become optional (companies use PAN, not Aadhaar).
ALTER TABLE "Party" ADD COLUMN "partyType" TEXT NOT NULL DEFAULT 'individual';
ALTER TABLE "Party" ALTER COLUMN "aadhaarNumber" DROP NOT NULL;
ALTER TABLE "Party" ALTER COLUMN "fileName" DROP NOT NULL;
ALTER TABLE "Party" ALTER COLUMN "mimeType" DROP NOT NULL;
ALTER TABLE "Party" ALTER COLUMN "size" DROP NOT NULL;
ALTER TABLE "Party" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "Party" ADD COLUMN "panNumber" TEXT;
ALTER TABLE "Party" ADD COLUMN "panFileName" TEXT;
ALTER TABLE "Party" ADD COLUMN "panMimeType" TEXT;
ALTER TABLE "Party" ADD COLUMN "panSize" INTEGER;
ALTER TABLE "Party" ADD COLUMN "panData" BYTEA;
CREATE UNIQUE INDEX "Party_panNumber_key" ON "Party"("panNumber");
