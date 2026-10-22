import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Runs migration 20261022090000_org_profile_billing_details against the real
 * database inside a transaction that is always rolled back. Opt-in (needs a
 * database): RUN_DB_TESTS=1 npx jest org-billing-details.migration
 */
const run = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

const SQL = fs.readFileSync(
  path.join(
    __dirname,
    '../../../prisma/migrations/20261022090000_org_profile_billing_details/migration.sql',
  ),
  'utf8',
);

class Rollback extends Error {}

run('migration: org profile billing details', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it('maps state names to codes, clears the rest, and backfills only empty fields', async () => {
    const seen: Record<string, Record<string, unknown>> = {};
    await prisma
      .$transaction(
        async (tx) => {
          const mk = (name: string, data: Record<string, unknown>) =>
            tx.organisation.create({
              data: { name, slug: `mig-test-${name}-${Date.now()}`, ...data },
            });
          const name = await mk('name', { state: ' karnataka ' });
          const abbr = await mk('abbr', { state: 'MH' });
          const junk = await mk('junk', { state: 'Bangalore Urban' });
          const keep = await mk('keep', {
            state: 'Maharashtra',
            city: 'Pune',
            postalCode: '411001',
            gstin: '27AABCS1234F1Z5',
          });
          await tx.billingProfile.create({
            data: {
              organisationId: keep.id,
              legalName: 'Profile Ltd',
              addressLine1: 'Profile Road',
              city: 'Bengaluru',
              state: '29',
              pincode: '560001',
              gstin: '29AABCS1234F1Z5',
            },
          });
          const fill = await mk('fill', { state: null });
          await tx.billingProfile.create({
            data: {
              organisationId: fill.id,
              legalName: 'Fill Ltd',
              addressLine1: 'Fill Road',
              city: 'Mysuru',
              state: '29',
              pincode: '570001',
              gstin: '29aabcs1234f1z5',
            },
          });

          await tx.$executeRawUnsafe(SQL);
          await tx.$executeRawUnsafe(SQL); // safe to run again

          for (const o of [name, abbr, junk, keep, fill]) {
            seen[o.name] = await tx.organisation.findUniqueOrThrow({
              where: { id: o.id },
            });
          }
          throw new Rollback();
        },
        { timeout: 60_000 },
      )
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });

    expect(seen.name.state).toBe('29');
    expect(seen.abbr.state).toBe('27');
    expect(seen.junk.state).toBeNull();
    // Filled-in values are never overwritten; only the empty address is.
    expect(seen.keep).toMatchObject({
      city: 'Pune',
      state: '27',
      postalCode: '411001',
      gstin: '27AABCS1234F1Z5',
      addressLine1: 'Profile Road',
    });
    // The profile's legal name is not copied (invoices use the org name).
    expect(seen.fill.legalName).toBeNull();
    expect(seen.fill).toMatchObject({
      addressLine1: 'Fill Road',
      city: 'Mysuru',
      state: '29',
      postalCode: '570001',
      gstin: '29AABCS1234F1Z5',
    });
  });
});
