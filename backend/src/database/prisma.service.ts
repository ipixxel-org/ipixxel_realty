import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.ensureProductionSchema();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Prod often deploys Prisma client ahead of migrations. Login and
  // /org/permissions/me then 500 because a selected column/table is missing.
  // ensure-all-tables.sql is idempotent (IF NOT EXISTS) and covers every
  // schema/table/index from schema.prisma so a drifted prod DB can boot.
  private async ensureProductionSchema() {
    const statements = [
      ...this.loadEnsureSqlStatements(),
      // Column-level backfills that CREATE TABLE IF NOT EXISTS cannot add
      // once a table already exists with an older shape.
      `ALTER TABLE "identity"."users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3)`,
      `ALTER TABLE "identity"."users" ADD COLUMN IF NOT EXISTS "onboarding_step" TEXT`,
      `ALTER TABLE "identity"."users" ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "identity"."users" ADD COLUMN IF NOT EXISTS "country" TEXT`,
      `ALTER TABLE "identity"."users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMP(3)`,
      `ALTER TABLE "identity"."roles" ADD COLUMN IF NOT EXISTS "org_id" TEXT`,
      `ALTER TABLE "identity"."roles" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE "identity"."organisations" ADD COLUMN IF NOT EXISTS "custom_domain_landing_page_id" TEXT`,
      `ALTER TABLE "access"."role_module_permissions" ADD COLUMN IF NOT EXISTS "org_id" TEXT NOT NULL DEFAULT 'system'`,
      `ALTER TABLE "access"."role_module_permissions" ADD COLUMN IF NOT EXISTS "can_approve" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "access"."role_module_permissions" ADD COLUMN IF NOT EXISTS "can_activate" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "access"."role_module_permissions" ADD COLUMN IF NOT EXISTS "can_deactivate" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "access"."user_module_permissions" ADD COLUMN IF NOT EXISTS "can_activate" BOOLEAN`,
      `ALTER TABLE "access"."user_module_permissions" ADD COLUMN IF NOT EXISTS "can_deactivate" BOOLEAN`,
      `ALTER TABLE "access"."role_module_permissions" ADD COLUMN IF NOT EXISTS "can_add_lead" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "access"."user_module_permissions" ADD COLUMN IF NOT EXISTS "can_add_lead" BOOLEAN`,
      // Users > Approve was split into Activate + Deactivate (see migration
      // 20260924120000). Idempotent: once moved, can_approve is cleared, and
      // saves never write can_approve for the Users module again.
      `UPDATE "access"."role_module_permissions" SET "can_activate" = true, "can_deactivate" = true, "can_approve" = false WHERE "module_key" = 'users' AND "can_approve" = true`,
      `UPDATE "access"."user_module_permissions" SET "can_activate" = "can_approve", "can_deactivate" = "can_approve", "can_approve" = NULL WHERE "module_key" = 'users' AND "can_approve" IS NOT NULL`,
      `ALTER TABLE "identity"."media_files" ADD COLUMN IF NOT EXISTS "alt" TEXT`,
      `ALTER TABLE "billing"."plans" ADD COLUMN IF NOT EXISTS "capabilities" JSONB`,
      `ALTER TABLE "billing"."plans" ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "access"."teams" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active'`,
      `ALTER TABLE "audit"."support_tickets" ADD COLUMN IF NOT EXISTS "hold_reason" TEXT`,
      `ALTER TABLE "audit"."support_tickets" ADD COLUMN IF NOT EXISTS "assigned_to_id" TEXT`,
      `ALTER TYPE "templates"."OrgDomainRequestStatus" ADD VALUE IF NOT EXISTS 'changes_requested'`,
      `ALTER TYPE "templates"."OrgDomainRequestStatus" ADD VALUE IF NOT EXISTS 'suspended'`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "project_id" TEXT`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "dns_status" TEXT NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "ssl_status" TEXT NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "verification_token" TEXT`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "verification_details" JSONB`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "ssl_details" JSONB`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "redirect_www" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "preferred_hostname" TEXT`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "domain_type" TEXT`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "admin_feedback" TEXT`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "is_suspended" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "suspended_reason" TEXT`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3)`,
      `ALTER TABLE "templates"."org_domain_requests" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3)`,
    ];

    for (const sql of statements) {
      try {
        await this.$executeRawUnsafe(sql);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Schema backfill skipped: ${message}`);
      }
    }
  }

  private loadEnsureSqlStatements(): string[] {
    const candidates = [
      join(process.cwd(), 'prisma', 'ensure-all-tables.sql'),
      join(__dirname, '..', '..', 'prisma', 'ensure-all-tables.sql'),
      join(__dirname, '..', '..', '..', 'prisma', 'ensure-all-tables.sql'),
    ];
    const path = candidates.find((p) => existsSync(p));
    if (!path) {
      this.logger.warn(
        'ensure-all-tables.sql not found — falling back to inline schema ensures',
      );
      return this.inlineFallbackStatements();
    }

    const raw = readFileSync(path, 'utf8');
    return splitSqlStatements(raw);
  }

  private inlineFallbackStatements(): string[] {
    return [
      `CREATE SCHEMA IF NOT EXISTS "identity"`,
      `CREATE SCHEMA IF NOT EXISTS "access"`,
      `CREATE SCHEMA IF NOT EXISTS "audit"`,
      `CREATE SCHEMA IF NOT EXISTS "billing"`,
      `CREATE SCHEMA IF NOT EXISTS "templates"`,
      `CREATE SCHEMA IF NOT EXISTS "projects"`,
      `CREATE TABLE IF NOT EXISTS "access"."user_module_permissions" (
          "org_id" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "module_key" TEXT NOT NULL,
          "can_view" BOOLEAN,
          "can_add" BOOLEAN,
          "can_edit" BOOLEAN,
          "can_delete" BOOLEAN,
          "can_approve" BOOLEAN,
          CONSTRAINT "user_module_permissions_pkey" PRIMARY KEY ("org_id", "user_id", "module_key")
        )`,
      `CREATE TABLE IF NOT EXISTS "identity"."media_files" (
          "id" TEXT NOT NULL,
          "org_id" TEXT,
          "uploaded_by_id" TEXT,
          "name" TEXT NOT NULL,
          "filename" TEXT NOT NULL,
          "stored_key" TEXT NOT NULL,
          "public_url" TEXT NOT NULL,
          "mime_type" TEXT NOT NULL,
          "size" INTEGER NOT NULL,
          "category" TEXT NOT NULL DEFAULT 'image',
          "folder" TEXT NOT NULL DEFAULT 'general',
          "alt" TEXT,
          "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          "metadata" JSONB,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
        )`,
    ];
  }
}

/** Split SQL file into executable statements; keep DO $$ ... $$ blocks intact. */
function splitSqlStatements(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const statements: string[] = [];
  let buf: string[] = [];
  let inDo = false;

  const flush = () => {
    const text = buf.join('\n').trim();
    buf = [];
    if (!text || text.startsWith('--')) return;
    statements.push(text.replace(/;+\s*$/, ''));
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inDo && (trimmed.startsWith('--') || trimmed.length === 0) && buf.length === 0) {
      continue;
    }
    if (!inDo && /^DO\s+\$\$/i.test(trimmed)) {
      inDo = true;
    }
    buf.push(line);
    if (inDo) {
      if (/END\s+\$\$\s*;?\s*$/i.test(trimmed)) {
        inDo = false;
        flush();
      }
      continue;
    }
    if (trimmed.endsWith(';')) {
      flush();
    }
  }
  if (buf.length) flush();
  return statements;
}
