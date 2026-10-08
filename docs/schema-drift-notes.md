# Schema drift notes (pre-existing, not fixed)

_Found 2026-10-07 while verifying the Team Chat migration. Nothing here was changed. These items predate the chat work and are unrelated to it._

## How it was found

1. Created an empty database and ran `prisma migrate deploy` with every migration up to and including `20260928140000_marketing_integration_hub` (the state of `vidya_new` before the chat rebuild).
2. Ran `prisma migrate diff --from-url <that db> --to-schema-datamodel prisma/schema.prisma --script`.

A database built only from `prisma/migrations` should produce an empty diff. Instead it differs from `schema.prisma` as listed below. A brand-new database (a new environment, a fresh staging, a disaster-recovery restore from migrations) therefore does **not** have the schema the code expects.

The Team Chat migration (`20261007120000_team_chat_rebuild`) fixes the one chat item in this list (`team_messages_org_id_fkey`). After it runs, the remaining diff is exactly the items below, on both a fresh database and an upgraded one.

Production may differ from this list in either direction, because of the boot-time `ensure-all-tables.sql` and `init-media-table.ts` (see item 1). This was **not verified against production**. Before writing any fix, run the same `migrate diff` against a copy of the prod database.

## Findings

### 1. `identity.media_files` is never created by a migration

- `schema.prisma` has `model MediaFile` (line ~2266). No migration creates the table.
- It exists in practice only because the API creates it at boot: `prisma/ensure-all-tables.sql` (`CREATE TABLE IF NOT EXISTS "identity"."media_files"`, ~line 978) and `src/database/init-media-table.ts`.
- The diff wants to create the table, its 4 indexes (`org_id`, `category`, `folder`, `created_at`) and 2 FKs (`org_id` → organisations ON DELETE CASCADE, `uploaded_by_id` → users ON DELETE SET NULL).
- **Risk:** the boot-time copy and `schema.prisma` may differ: index names (`idx_media_files_org_id` in `init-media-table.ts` vs `media_files_org_id_idx`) and FKs. A future `migrate dev` would try to create a table that already exists in every running environment. **Fix direction:** a migration using `CREATE TABLE IF NOT EXISTS` / guarded index and FK creation (like the chat migration), then drop the boot-time creation.

### 2. `identity.platform_configs.primary_color` / `secondary_color` are missing

- `schema.prisma` has `primaryColor String @default("#0f1424")` (and `secondaryColor`, default `#2a3348`). No migration adds either column.
- They aren't in `ensure-all-tables.sql` or the inline backfills in `prisma.service.ts`. So on a migrations-only database, any query that selects them fails. Not verified: how prod got them, if it has them (probably `prisma db push` or a manual change).
- **Fix direction:** `ADD COLUMN IF NOT EXISTS` with the schema defaults. Safe and additive.

### 3. `templates.templates.category` and `is_paid` exist in the DB but not in the schema

- Added by `20260824145251_add_org_templates` (`"is_paid" BOOLEAN NOT NULL DEFAULT false`, `"category" TEXT`), later removed from `schema.prisma` without a migration.
- The diff wants to `DROP COLUMN` both.
- **Do not let a tool apply this blindly.** Dropping the columns destroys whatever is stored there. Decide first whether the data is still needed, for example whether `category` was replaced by the template-categories feature (`20260921010000_add_template_categories`). Either drop them deliberately in a reviewed migration, or add them back to the schema.

### 4. `updated_at` defaults on marketing / Meta tables

- Tables: `marketing_ad_sets`, `marketing_ads`, `marketing_campaigns`, `marketing_connections`, `marketing_org_platform_access`, `marketing_platforms`, `meta_page_connections`, `platform_attribution_labels` (all `identity`).
- Their migrations created `updated_at` with `DEFAULT CURRENT_TIMESTAMP`. The schema uses `@updatedAt`, which Prisma models without a DB default, so the diff wants `ALTER COLUMN "updated_at" DROP DEFAULT`.
- **Impact:** cosmetic. Prisma sets the value itself on every write; the default only matters for raw SQL inserts. Low priority; harmless either way.

### 5. Array defaults on `templates.leads`

- `configurations` and `tags` should default to `ARRAY[]::TEXT[]` per the schema; the migrated table has no default.
- **Impact:** low. Prisma writes `[]` itself, but raw inserts get NULL. Additive fix.

### 6. Index name truncation on `marketing_connections`

- The migration's unique index is named `marketing_connections_org_id_platform_key_external_account_id_k`; Prisma now expects `marketing_connections_org_id_platform_key_external_account__key` (63-character truncation).
- **Impact:** none functionally. The diff wants a rename; a one-line guarded `ALTER INDEX ... RENAME`.

## Suggested next step

One reviewed "schema drift catch-up" migration, written in the same guarded and idempotent style as the chat migration:
- Covers items 1, 2, 4, 5 and 6 (all additive or cosmetic).
- Leaves item 3 out until someone decides what happens to that data.
- Verified the same way: migrate a fresh DB and a copy of production, then expect an empty diff.
