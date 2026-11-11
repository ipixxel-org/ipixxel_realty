-- The Templates platform module gets one pill per action:
--   View, Create, Edit, Delete, Publish (stored on admin_templates)
--   Manage Settings, Duplicate, Reset to Preset, Categories (each on its own
--   backing module, shown as a pill under the Templates row).
--
-- So nobody gains or loses access on deploy, every platform role keeps what
-- the old method-based check allowed:
--   Publish          <- Edit   (publishing was a template PATCH = Edit)
--   Manage Settings  <- Edit   (saving settings was a PATCH = Edit)
--   Duplicate        <- Add    (POST /duplicate = Add)
--   Reset to Preset  <- Add    (POST /reset = Add)
--   Categories       <- Add, Edit or Delete (category POST / PATCH / DELETE)
-- Data only, no schema change. Inserts are guarded: a row that already
-- exists (a re-run, or a role already set by hand) is left as it is.

-- Publish. The old "Approve" pill on Templates gated nothing, so it now
-- mirrors Edit, which is what publishing needed until now.
UPDATE "access"."role_module_permissions"
SET "can_approve" = "can_edit"
WHERE "module_key" = 'admin_templates';

-- Manage Settings
INSERT INTO "access"."role_module_permissions"
  ("org_id", "role_id", "module_key", "can_view", "can_add", "can_edit",
   "can_delete", "can_approve", "can_activate", "can_deactivate", "can_add_lead")
SELECT "org_id", "role_id", 'admin_templates_settings', "can_edit", false, "can_edit",
       false, false, false, false, false
FROM "access"."role_module_permissions"
WHERE "module_key" = 'admin_templates'
ON CONFLICT ("org_id", "role_id", "module_key") DO NOTHING;

-- Duplicate
INSERT INTO "access"."role_module_permissions"
  ("org_id", "role_id", "module_key", "can_view", "can_add", "can_edit",
   "can_delete", "can_approve", "can_activate", "can_deactivate", "can_add_lead")
SELECT "org_id", "role_id", 'admin_templates_duplicate', "can_add", "can_add", false,
       false, false, false, false, false
FROM "access"."role_module_permissions"
WHERE "module_key" = 'admin_templates'
ON CONFLICT ("org_id", "role_id", "module_key") DO NOTHING;

-- Reset to Preset
INSERT INTO "access"."role_module_permissions"
  ("org_id", "role_id", "module_key", "can_view", "can_add", "can_edit",
   "can_delete", "can_approve", "can_activate", "can_deactivate", "can_add_lead")
SELECT "org_id", "role_id", 'admin_templates_reset', "can_add", false, "can_add",
       false, false, false, false, false
FROM "access"."role_module_permissions"
WHERE "module_key" = 'admin_templates'
ON CONFLICT ("org_id", "role_id", "module_key") DO NOTHING;

-- Categories
INSERT INTO "access"."role_module_permissions"
  ("org_id", "role_id", "module_key", "can_view", "can_add", "can_edit",
   "can_delete", "can_approve", "can_activate", "can_deactivate", "can_add_lead")
SELECT "org_id", "role_id", 'admin_templates_categories',
       ("can_add" OR "can_edit" OR "can_delete"), false,
       ("can_add" OR "can_edit" OR "can_delete"),
       false, false, false, false, false
FROM "access"."role_module_permissions"
WHERE "module_key" = 'admin_templates'
ON CONFLICT ("org_id", "role_id", "module_key") DO NOTHING;
