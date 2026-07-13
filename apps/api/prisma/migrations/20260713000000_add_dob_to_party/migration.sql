-- Add optional date of birth (free text, typically OCR'd off Aadhaar) to Party.
ALTER TABLE "Party" ADD COLUMN "dob" TEXT;
