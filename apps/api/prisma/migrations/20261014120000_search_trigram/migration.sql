-- Global search: trigram indexes for ILIKE / similarity. Additive only.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "DeedTemplate_title_trgm_idx" ON "DeedTemplate" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "DraftIntake_customerName_trgm_idx" ON "DraftIntake" USING gin ("customerName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Task_title_trgm_idx" ON "Task" USING gin ("title" gin_trgm_ops);
