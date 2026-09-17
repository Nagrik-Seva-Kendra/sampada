-- Who acts for a saved organisation (a firm's partners, a company's
-- directors), so picking the firm for a deed brings its signatories along.
--
-- Additive: a new table only. Removing a saved person or firm removes its links.
-- to undo:
--   DROP TABLE "PartyMember";

-- CreateTable
CREATE TABLE "PartyMember" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "designation" TEXT NOT NULL DEFAULT 'पार्टनर',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "PartyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartyMember_firmId_personId_key" ON "PartyMember"("firmId", "personId");

-- CreateIndex
CREATE INDEX "PartyMember_organizationId_firmId_idx" ON "PartyMember"("organizationId", "firmId");

-- CreateIndex
CREATE INDEX "PartyMember_personId_idx" ON "PartyMember"("personId");

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
