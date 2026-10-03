-- Colony auto-draft (project master, plot master, sales). Additive only.
CREATE TABLE "ColonyProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "village" TEXT NOT NULL,
    "developer" TEXT NOT NULL,
    "partners" JSONB NOT NULL DEFAULT '[]',
    "devPermissions" JSONB NOT NULL DEFAULT '[]',
    "maintenanceClauses" JSONB NOT NULL DEFAULT '[]',
    "guidelineRatePerSqm" DOUBLE PRECISION,
    "template" TEXT NOT NULL DEFAULT '',
    "templateDeedId" TEXT,
    "companyNumbers" JSONB NOT NULL DEFAULT '[]',
    "live" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ColonyProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ColonyProject_organizationId_name_key" ON "ColonyProject"("organizationId", "name");

CREATE TABLE "ColonyPlot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "plotNo" TEXT NOT NULL,
    "ewFt" DOUBLE PRECISION,
    "nsFt" DOUBLE PRECISION,
    "areaSqft" DOUBLE PRECISION,
    "east" TEXT,
    "west" TEXT,
    "north" TEXT,
    "south" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    CONSTRAINT "ColonyPlot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ColonyPlot_projectId_block_plotNo_key" ON "ColonyPlot"("projectId", "block", "plotNo");
CREATE INDEX "ColonyPlot_organizationId_projectId_idx" ON "ColonyPlot"("organizationId", "projectId");

CREATE TABLE "ColonySale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "plotId" TEXT NOT NULL,
    "partnerKey" TEXT NOT NULL,
    "buyers" JSONB NOT NULL,
    "consideration" INTEGER NOT NULL,
    "instalments" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deedId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ColonySale_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ColonySale_projectId_number_key" ON "ColonySale"("projectId", "number");
CREATE INDEX "ColonySale_organizationId_projectId_idx" ON "ColonySale"("organizationId", "projectId");
CREATE INDEX "ColonySale_plotId_idx" ON "ColonySale"("plotId");
