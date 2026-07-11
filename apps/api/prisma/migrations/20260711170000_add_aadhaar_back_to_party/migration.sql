-- Add Aadhaar back-side image support to Party.
ALTER TABLE "Party" ADD COLUMN "aadhaarBackFileName" TEXT;
ALTER TABLE "Party" ADD COLUMN "aadhaarBackMimeType" TEXT;
ALTER TABLE "Party" ADD COLUMN "aadhaarBackSize" INTEGER;
ALTER TABLE "Party" ADD COLUMN "aadhaarBackData" BYTEA;
