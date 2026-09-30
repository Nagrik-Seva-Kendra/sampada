-- WhatsApp draft review (additive). workStatus is TEXT, so the new values
-- CUSTOMER_APPROVED and CORRECTION_REQUESTED need no type change.
ALTER TABLE "DraftIntake" ADD COLUMN "deedTemplateId" TEXT;
