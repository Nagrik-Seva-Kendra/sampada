-- Purely additive (new nullable columns only) — reversible with:
--   ALTER TABLE "DeedPropertyDetail" DROP COLUMN "block", DROP COLUMN "district",
--   DROP COLUMN "guidelinePatwariHalkaNo", DROP COLUMN "patwariHalkaNo", DROP COLUMN "village";

-- AlterTable
ALTER TABLE "DeedPropertyDetail" ADD COLUMN     "block" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "guidelinePatwariHalkaNo" TEXT,
ADD COLUMN     "patwariHalkaNo" TEXT,
ADD COLUMN     "village" TEXT;
