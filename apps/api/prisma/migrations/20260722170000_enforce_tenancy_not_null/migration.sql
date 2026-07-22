-- Phase 1d — Enforce tenancy: organizationId NOT NULL + per-org Party uniqueness.
-- Prerequisite: the 1b backfill must have run (every tenant row has an org).
-- Applied together with the tenant-scoping extension, which guarantees new
-- writes set organizationId — so tightening the constraint is now safe.

-- Guard: refuse to proceed if any tenant row is still unscoped.
DO $$
DECLARE v int;
BEGIN
  SELECT (SELECT count(*) FROM "DeedTemplate"         WHERE "organizationId" IS NULL)
       + (SELECT count(*) FROM "DeedTemplateRevision" WHERE "organizationId" IS NULL)
       + (SELECT count(*) FROM "Party"                WHERE "organizationId" IS NULL)
       + (SELECT count(*) FROM "DeedParty"            WHERE "organizationId" IS NULL)
       + (SELECT count(*) FROM "DeedNaxa"             WHERE "organizationId" IS NULL)
       + (SELECT count(*) FROM "GuidelineDocument"    WHERE "organizationId" IS NULL)
    INTO v;
  IF v > 0 THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL: % tenant rows still unscoped — run the 1b backfill first.', v;
  END IF;
END $$;

-- Swap each org FK from ON DELETE SET NULL to RESTRICT (a required relation) and
-- set the column NOT NULL.
ALTER TABLE "DeedTemplate" DROP CONSTRAINT "DeedTemplate_organizationId_fkey";
ALTER TABLE "DeedTemplate" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "DeedTemplate" ADD CONSTRAINT "DeedTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeedTemplateRevision" DROP CONSTRAINT "DeedTemplateRevision_organizationId_fkey";
ALTER TABLE "DeedTemplateRevision" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "DeedTemplateRevision" ADD CONSTRAINT "DeedTemplateRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Party" DROP CONSTRAINT "Party_organizationId_fkey";
ALTER TABLE "Party" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Party" ADD CONSTRAINT "Party_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeedParty" DROP CONSTRAINT "DeedParty_organizationId_fkey";
ALTER TABLE "DeedParty" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "DeedParty" ADD CONSTRAINT "DeedParty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeedNaxa" DROP CONSTRAINT "DeedNaxa_organizationId_fkey";
ALTER TABLE "DeedNaxa" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "DeedNaxa" ADD CONSTRAINT "DeedNaxa_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuidelineDocument" DROP CONSTRAINT "GuidelineDocument_organizationId_fkey";
ALTER TABLE "GuidelineDocument" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "GuidelineDocument" ADD CONSTRAINT "GuidelineDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Party dedup is now per-organization, not global.
DROP INDEX "Party_aadhaarNumber_key";
DROP INDEX "Party_panNumber_key";
CREATE UNIQUE INDEX "Party_organizationId_aadhaarNumber_key" ON "Party"("organizationId", "aadhaarNumber");
CREATE UNIQUE INDEX "Party_organizationId_panNumber_key" ON "Party"("organizationId", "panNumber");

-- Rollback (by hand): reverse each (drop RESTRICT fk, DROP NOT NULL, re-add SET
-- NULL fk), and restore the global unique indexes on Party(aadhaarNumber)/(panNumber).
