-- Phase 0.5 — Add User.tokenVersion for session revocation.
-- Additive and safe on live data: existing rows default to 0, and existing
-- tokens (pre-hardening) carry no version, so the guard treats a missing
-- version as 0 and they keep working until they expire.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Rollback (apply by hand; Prisma has no native down):
--   ALTER TABLE "User" DROP COLUMN "tokenVersion";
