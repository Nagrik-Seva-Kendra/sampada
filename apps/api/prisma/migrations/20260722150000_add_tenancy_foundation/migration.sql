-- Phase 1a — Tenancy foundation (ADDITIVE ONLY, safe on live data).
-- Creates Organization + Membership and adds a NULLABLE organizationId to every
-- tenant-scoped table. Nothing is backfilled or made NOT NULL here, and no
-- existing column is removed — that is Phase 1b, which creates org #1, builds a
-- Membership per user, backfills organizationId, verifies zero orphans, and only
-- then tightens the constraints. Keeping this migration purely additive means it
-- can deploy ahead of the data migration with zero risk to the running app.

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'EMPLOYEE');
CREATE TYPE "MemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'TRIALING',
    "joinCode" TEXT NOT NULL,
    "nextEmployeeCode" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING',
    "employeeCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- AlterTable: nullable organizationId on tenant-scoped tables
ALTER TABLE "DeedTemplate" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "DeedTemplateRevision" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Party" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "DeedParty" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "DeedNaxa" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "GuidelineDocument" ADD COLUMN "organizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Organization_joinCode_key" ON "Organization"("joinCode");
CREATE INDEX "Membership_organizationId_status_idx" ON "Membership"("organizationId", "status");
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");
CREATE UNIQUE INDEX "Membership_organizationId_employeeCode_key" ON "Membership"("organizationId", "employeeCode");
CREATE INDEX "DeedTemplate_organizationId_type_idx" ON "DeedTemplate"("organizationId", "type");
CREATE INDEX "DeedTemplateRevision_organizationId_deedId_idx" ON "DeedTemplateRevision"("organizationId", "deedId");
CREATE INDEX "Party_organizationId_idx" ON "Party"("organizationId");
CREATE INDEX "DeedParty_organizationId_deedId_idx" ON "DeedParty"("organizationId", "deedId");
CREATE INDEX "DeedNaxa_organizationId_deedId_idx" ON "DeedNaxa"("organizationId", "deedId");
CREATE INDEX "GuidelineDocument_organizationId_district_session_idx" ON "GuidelineDocument"("organizationId", "district", "session");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeedTemplate" ADD CONSTRAINT "DeedTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeedTemplateRevision" ADD CONSTRAINT "DeedTemplateRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Party" ADD CONSTRAINT "Party_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeedParty" ADD CONSTRAINT "DeedParty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeedNaxa" ADD CONSTRAINT "DeedNaxa_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuidelineDocument" ADD CONSTRAINT "GuidelineDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (apply by hand; Prisma has no native down):
--   DROP TABLE "Membership"; DROP TABLE "Organization";
--   ALTER TABLE "DeedTemplate" DROP COLUMN "organizationId"; (repeat per tenant table)
--   ALTER TABLE "User" DROP COLUMN "isPlatformAdmin";
--   DROP TYPE "MemberStatus"; DROP TYPE "OrgRole"; DROP TYPE "OrgStatus";
