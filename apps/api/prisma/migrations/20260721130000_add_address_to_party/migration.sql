-- Add optional address (free text, typically OCR'd off the Aadhaar back) to Party.
ALTER TABLE "Party" ADD COLUMN "address" TEXT;
