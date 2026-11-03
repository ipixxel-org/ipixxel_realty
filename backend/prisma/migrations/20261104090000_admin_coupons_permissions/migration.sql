-- Coupons get their own platform permission module (admin_coupons), split
-- out of Subscriptions (admin_subscriptions). So nobody loses access, every
-- role keeps on Coupons what it had on Subscriptions:
--   View -> View (coupon list, usage), Add -> Create (new coupon),
--   Edit -> Edit (change a coupon). Coupons have no Delete or Approve.
-- Data only, no schema change. Guarded: a row that already exists (a re-run,
-- or a role already set by hand) is left as it is.

INSERT INTO "access"."role_module_permissions"
  ("org_id", "role_id", "module_key", "can_view", "can_add", "can_edit",
   "can_delete", "can_approve", "can_activate", "can_deactivate", "can_add_lead")
SELECT "org_id", "role_id", 'admin_coupons', "can_view", "can_add", "can_edit",
       false, false, false, false, false
FROM "access"."role_module_permissions"
WHERE "module_key" = 'admin_subscriptions'
ON CONFLICT ("org_id", "role_id", "module_key") DO NOTHING;
