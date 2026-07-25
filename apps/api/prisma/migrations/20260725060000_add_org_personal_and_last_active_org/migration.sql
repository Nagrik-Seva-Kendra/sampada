-- Personal accounts: every onboarding signup gets a single-member Organization
-- flagged isPersonal, and User.lastActiveOrganizationId remembers which org a
-- session should land back in on next login/refresh.

ALTER TABLE "Organization" ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "lastActiveOrganizationId" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_lastActiveOrganizationId_fkey"
  FOREIGN KEY ("lastActiveOrganizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (apply by hand; Prisma has no native down):
--   ALTER TABLE "User" DROP CONSTRAINT "User_lastActiveOrganizationId_fkey";
--   ALTER TABLE "User" DROP COLUMN "lastActiveOrganizationId";
--   ALTER TABLE "Organization" DROP COLUMN "isPersonal";
