-- Phase 0.1b — Drop the reversible AES-256-GCM password copy.
--
-- SAFETY / ORDERING: run this ONLY after the code release that stops reading
-- and writing "passwordEnc" (commit "Phase 0.1a") is live. That deploy already
-- stopped populating this column, so dropping it now cannot lose in-flight
-- writes. This migration deliberately does nothing except remove the column.
--
-- Forward:
ALTER TABLE "User" DROP COLUMN "passwordEnc";

-- Rollback (Prisma has no native `down`; apply this by hand to reverse):
--   ALTER TABLE "User" ADD COLUMN "passwordEnc" TEXT;
-- The column comes back empty. The plaintext-recoverable data is intentionally
-- unrecoverable — that is the entire point of this change — so a rollback
-- restores the column shape only, never the old decryptable values.
