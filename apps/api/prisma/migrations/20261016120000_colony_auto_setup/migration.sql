-- Colony Setup from old deeds: project kind (plots / shops), ward, survey numbers,
-- search aliases, the guideline row (office calculator); corner and floor per plot / unit.
ALTER TABLE "ColonyProject" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PLOT';
ALTER TABLE "ColonyProject" ADD COLUMN "ward" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ColonyProject" ADD COLUMN "surveyNos" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ColonyProject" ADD COLUMN "aliases" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ColonyProject" ADD COLUMN "guidelineSno" INTEGER;
ALTER TABLE "ColonyPlot" ADD COLUMN "corner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ColonyPlot" ADD COLUMN "floor" TEXT;
