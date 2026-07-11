-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aadhaarNumber" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeedParty" (
    "id" TEXT NOT NULL,
    "deedId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeedParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeedNaxa" (
    "id" TEXT NOT NULL,
    "deedId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeedNaxa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Party_aadhaarNumber_key" ON "Party"("aadhaarNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeedParty_deedId_partyId_role_key" ON "DeedParty"("deedId", "partyId", "role");

-- CreateIndex
CREATE INDEX "DeedParty_deedId_idx" ON "DeedParty"("deedId");

-- CreateIndex
CREATE INDEX "DeedParty_partyId_idx" ON "DeedParty"("partyId");

-- CreateIndex
CREATE INDEX "DeedNaxa_deedId_idx" ON "DeedNaxa"("deedId");

-- AddForeignKey
ALTER TABLE "DeedParty" ADD CONSTRAINT "DeedParty_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
