-- A file (PDF / photo) the owner sends with a task on WhatsApp.
ALTER TABLE "Task" ADD COLUMN "documentKey" TEXT;
ALTER TABLE "Task" ADD COLUMN "documentName" TEXT;
ALTER TABLE "Task" ADD COLUMN "documentMime" TEXT;
