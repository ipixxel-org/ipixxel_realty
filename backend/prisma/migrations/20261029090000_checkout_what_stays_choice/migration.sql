-- Billing v2, online step 2: the "choose what stays" option picked at the
-- checkout ('default' = keep the default picks, 'saved' = their own saved
-- choice), applied when an online payment is fulfilled. Additive; guarded so
-- a re-run is a no-op.

ALTER TABLE IF EXISTS "billing"."billing_checkouts"
  ADD COLUMN IF NOT EXISTS "what_stays_choice" TEXT;
