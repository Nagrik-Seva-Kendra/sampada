-- Which starter a seeded deed was copied from, so retiring a starter can find
-- its copies exactly rather than matching on the title.
--
-- Additive and nullable: existing rows (including copies seeded before this)
-- read as "not from a starter" until backfilled.
-- to undo:
--   DROP INDEX "DeedTemplate_starterSourceId_idx";
--   ALTER TABLE "DeedTemplate" DROP COLUMN "starterSourceId";

-- AlterTable
ALTER TABLE "DeedTemplate" ADD COLUMN "starterSourceId" TEXT;

-- CreateIndex
CREATE INDEX "DeedTemplate_starterSourceId_idx" ON "DeedTemplate"("starterSourceId");
