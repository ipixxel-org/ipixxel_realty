-- A payment / checkout keeps its history when the user who started it is
-- deleted (created_by_id becomes NULL) instead of blocking the delete — this
-- blocked deleting an organisation, and deleting a user, once they had paid.
-- Guarded so it can be applied more than once.
ALTER TABLE "billing"."payments" DROP CONSTRAINT IF EXISTS "payments_created_by_id_fkey";
ALTER TABLE "billing"."payments" ALTER COLUMN "created_by_id" DROP NOT NULL;
ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing"."billing_checkouts" DROP CONSTRAINT IF EXISTS "billing_checkouts_created_by_id_fkey";
ALTER TABLE "billing"."billing_checkouts" ALTER COLUMN "created_by_id" DROP NOT NULL;
ALTER TABLE "billing"."billing_checkouts" ADD CONSTRAINT "billing_checkouts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
