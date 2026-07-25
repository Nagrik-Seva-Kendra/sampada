-- Mirrors main's 20260721150000_drop_form_data_from_deed_template — the
-- legacy paper-form snapshot field (and its /form-state save endpoint) was
-- removed on main while this branch was mid-flight on the multi-tenant
-- work, so this branch picks up the same column drop on its own timeline.
ALTER TABLE "DeedTemplate" DROP COLUMN IF EXISTS "formData";
