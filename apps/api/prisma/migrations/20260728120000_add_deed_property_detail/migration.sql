-- Purely additive (one new table, no existing tables touched) — reversible
-- with: DROP TABLE "DeedPropertyDetail";

-- CreateTable
CREATE TABLE "DeedPropertyDetail" (
    "id" TEXT NOT NULL,
    "deedId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plotNo" TEXT NOT NULL,
    "khasraNo" TEXT,
    "location" TEXT NOT NULL,
    "shape" TEXT NOT NULL DEFAULT 'rectangle',
    "ewLength" DECIMAL(65,30) NOT NULL,
    "nsLength" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "statedArea" DECIMAL(65,30),
    "statedAreaUnit" TEXT,
    "boundaryNorth" TEXT NOT NULL,
    "boundarySouth" TEXT NOT NULL,
    "boundaryEast" TEXT NOT NULL,
    "boundaryWest" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DeedPropertyDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeedPropertyDetail_deedId_key" ON "DeedPropertyDetail"("deedId");

-- CreateIndex
CREATE INDEX "DeedPropertyDetail_organizationId_plotNo_idx" ON "DeedPropertyDetail"("organizationId", "plotNo");

-- CreateIndex
CREATE INDEX "DeedPropertyDetail_deedId_idx" ON "DeedPropertyDetail"("deedId");

-- AddForeignKey
ALTER TABLE "DeedPropertyDetail" ADD CONSTRAINT "DeedPropertyDetail_deedId_fkey" FOREIGN KEY ("deedId") REFERENCES "DeedTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeedPropertyDetail" ADD CONSTRAINT "DeedPropertyDetail_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

