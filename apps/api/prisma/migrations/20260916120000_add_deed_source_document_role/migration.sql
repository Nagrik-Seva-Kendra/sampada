-- Whose paper each uploaded document is: the seller's ID, the buyer's ID, or
-- a property document. Uploaded into separate slots, so filling the deed
-- never has to guess whose card it is from the name printed on it.
--
-- Additive, with a default: rows from before this read as property papers.
-- to undo:
--   ALTER TABLE "DeedSourceDocument" DROP COLUMN "role";

-- AlterTable
ALTER TABLE "DeedSourceDocument" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'property';
