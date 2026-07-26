-- Guideline library: English and Hindi PDFs are separate rows (same district
-- + session, different language) so the site can show/download whichever
-- language the viewer has selected.
CREATE TYPE "Language" AS ENUM ('en', 'hi');

ALTER TABLE "GuidelineDocument" ADD COLUMN "language" "Language" NOT NULL DEFAULT 'en';

CREATE INDEX "GuidelineDocument_district_session_language_idx" ON "GuidelineDocument"("district", "session", "language");

-- Rollback (apply by hand; Prisma has no native down):
--   DROP INDEX "GuidelineDocument_district_session_language_idx";
--   ALTER TABLE "GuidelineDocument" DROP COLUMN "language";
--   DROP TYPE "Language";
