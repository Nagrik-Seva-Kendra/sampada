-- Reversible: re-add the dropped columns (all nullable) and restore plotNo's
-- NOT NULL constraint (only safe if every existing row already has one) to
-- undo:
--   ALTER TABLE "DeedPropertyDetail" ADD COLUMN "district" TEXT, ADD COLUMN
--   "guidelinePatwariHalkaNo" TEXT, ADD COLUMN "khasraNo" TEXT, ADD COLUMN
--   "patwariHalkaNo" TEXT, ADD COLUMN "village" TEXT, DROP COLUMN
--   "buyerName", DROP COLUMN "sellerName", ALTER COLUMN "plotNo" SET NOT NULL;

-- AlterTable
ALTER TABLE "DeedPropertyDetail" DROP COLUMN "district",
DROP COLUMN "guidelinePatwariHalkaNo",
DROP COLUMN "khasraNo",
DROP COLUMN "patwariHalkaNo",
DROP COLUMN "village",
ADD COLUMN     "buyerName" TEXT,
ADD COLUMN     "sellerName" TEXT,
ALTER COLUMN "plotNo" DROP NOT NULL;
