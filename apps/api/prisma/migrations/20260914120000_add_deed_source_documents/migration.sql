-- The paperwork a deed was drafted from -- Aadhaar, PAN, khasra/B1, an older
-- registry -- kept per deed in one store instead of a table per document kind.
--
-- "extracted" caches the model's reading of each file so re-opening a deed does
-- not re-bill the same page: NULL means not read yet, an empty array means read
-- with nothing useful found. "extractError" holds the reason a read failed.
--
-- Additive: no existing table or column is touched.
-- to undo:
--   DROP TABLE "DeedSourceDocument";

-- CreateTable
CREATE TABLE "DeedSourceDocument" (
    "id" TEXT NOT NULL,
    "deedId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "extracted" JSONB,
    "extractError" TEXT,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "DeedSourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeedSourceDocument_deedId_idx" ON "DeedSourceDocument"("deedId");

-- CreateIndex
CREATE INDEX "DeedSourceDocument_organizationId_deedId_idx" ON "DeedSourceDocument"("organizationId", "deedId");

-- AddForeignKey
ALTER TABLE "DeedSourceDocument" ADD CONSTRAINT "DeedSourceDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
