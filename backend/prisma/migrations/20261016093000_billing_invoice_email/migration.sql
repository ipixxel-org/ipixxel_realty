-- Billing v2: when the "Payment received" / credit note email was sent for an
-- invoice. Claimed once so the Razorpay verify call and the webhook never
-- email the same payment twice. Guarded so it can be applied more than once.
ALTER TABLE "billing"."invoices" ADD COLUMN IF NOT EXISTS "emailed_at" TIMESTAMP(3);
