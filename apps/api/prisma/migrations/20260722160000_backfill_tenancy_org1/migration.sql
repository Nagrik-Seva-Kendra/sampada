-- Phase 1b — Data migration: seed organization #1 and backfill tenancy.
--
-- Data-only (no schema/DDL change). It:
--   1. creates organization #1 for the existing single customer,
--   2. creates a Membership for every existing staff user (earliest ADMIN ->
--      OWNER, other ADMINs -> ADMIN, EMPLOYEE -> EMPLOYEE), carrying status and
--      the existing per-user employeeCode,
--   3. seeds the org's nextEmployeeCode counter above the highest existing code,
--   4. backfills organizationId on every tenant-scoped row, and
--   5. RAISES (aborting the transaction) if any tenant row is still unscoped.
--
-- The NOT NULL tightening on organizationId is deliberately NOT here — it moves
-- to 1d, applied together with the Prisma tenant-scoping extension that injects
-- organizationId on writes. Tightening before writes are guaranteed to set it
-- would break every INSERT between this migration and 1d. Backfill now (safe,
-- reversible); constrain once writes are guaranteed (1d).
--
-- Idempotent: guards against re-creating the org/memberships; no-ops on a fresh
-- database (no users) so new deployments aren't polluted with a seed org.
--
-- Rollback: DELETE FROM "Membership" WHERE "organizationId"='org_primary_0001';
--           DELETE FROM "Organization" WHERE "id"='org_primary_0001';

DO $$
DECLARE
  v_org   text := 'org_primary_0001';
  v_owner text;
  v_orphans int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User") THEN
    RAISE NOTICE 'No existing users: fresh database, skipping tenancy backfill.';
    RETURN;
  END IF;

  -- 1. Organization #1 (the existing customer).
  IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE "id" = v_org) THEN
    INSERT INTO "Organization"
      ("id","name","slug","status","joinCode","nextEmployeeCode","createdAt","updatedAt")
    VALUES
      (v_org,'Nagrik Seva Kendra','nagrik-seva-kendra','ACTIVE',
       upper(substr(md5(random()::text),1,8)), 1, now(), now());
  END IF;

  -- 3. Seed nextEmployeeCode above the highest existing "EMP-####".
  UPDATE "Organization"
     SET "nextEmployeeCode" = COALESCE(
       (SELECT MAX((regexp_replace("employeeCode",'\D','','g'))::int)
          FROM "User"
         WHERE "employeeCode" ~ '^EMP-[0-9]+$'), 0) + 1
   WHERE "id" = v_org;

  -- 2. Earliest ADMIN becomes the OWNER.
  SELECT "id" INTO v_owner
    FROM "User" WHERE "role" = 'ADMIN'
   ORDER BY "createdAt" ASC, "id" ASC
   LIMIT 1;

  INSERT INTO "Membership"
    ("id","userId","organizationId","role","status","employeeCode","createdAt","updatedAt")
  SELECT
    gen_random_uuid()::text,
    u."id",
    v_org,
    CASE
      WHEN u."role" = 'ADMIN' AND u."id" = v_owner THEN 'OWNER'::"OrgRole"
      WHEN u."role" = 'ADMIN'                       THEN 'ADMIN'::"OrgRole"
      ELSE                                                'EMPLOYEE'::"OrgRole"
    END,
    u."status"::text::"MemberStatus",
    u."employeeCode",
    u."createdAt",
    now()
  FROM "User" u
  WHERE u."role" IN ('ADMIN','EMPLOYEE')
    AND NOT EXISTS (
      SELECT 1 FROM "Membership" m
       WHERE m."userId" = u."id" AND m."organizationId" = v_org
    );

  -- 4. Backfill organizationId on every tenant-scoped table.
  UPDATE "DeedTemplate"         SET "organizationId" = v_org WHERE "organizationId" IS NULL;
  UPDATE "DeedTemplateRevision" SET "organizationId" = v_org WHERE "organizationId" IS NULL;
  UPDATE "Party"                SET "organizationId" = v_org WHERE "organizationId" IS NULL;
  UPDATE "DeedParty"            SET "organizationId" = v_org WHERE "organizationId" IS NULL;
  UPDATE "DeedNaxa"             SET "organizationId" = v_org WHERE "organizationId" IS NULL;
  UPDATE "GuidelineDocument"    SET "organizationId" = v_org WHERE "organizationId" IS NULL;

  -- 5. Verify zero orphans BEFORE any NOT NULL is ever added (that's 1d).
  SELECT
      (SELECT count(*) FROM "DeedTemplate"         WHERE "organizationId" IS NULL)
    + (SELECT count(*) FROM "DeedTemplateRevision" WHERE "organizationId" IS NULL)
    + (SELECT count(*) FROM "Party"                WHERE "organizationId" IS NULL)
    + (SELECT count(*) FROM "DeedParty"            WHERE "organizationId" IS NULL)
    + (SELECT count(*) FROM "DeedNaxa"             WHERE "organizationId" IS NULL)
    + (SELECT count(*) FROM "GuidelineDocument"    WHERE "organizationId" IS NULL)
  INTO v_orphans;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Tenancy backfill incomplete: % tenant rows still have NULL organizationId', v_orphans;
  END IF;

  RAISE NOTICE 'Tenancy backfill complete: org %, % membership(s).',
    v_org, (SELECT count(*) FROM "Membership" WHERE "organizationId" = v_org);
END $$;
