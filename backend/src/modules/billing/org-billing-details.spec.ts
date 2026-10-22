/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { BadRequestException } from '@nestjs/common';
import { updateOrganisationProfile } from '../../common/utils/org-profile-audit.util';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';
import {
  cleanSeller,
  sellerProblem,
  sellerWarnings,
} from './admin-billing.service';
import { gstinProblem, isGstStateCode } from './gst';
import { issueCheckoutInvoice, type InvoicedCheckout } from './invoice.util';
import {
  billingDetailsFromOrg,
  countryCodeOf,
  missingBillingDetails,
  orgTaxDetailsProblem,
} from './org-billing-details';

describe('gstinProblem', () => {
  it('accepts an empty or a valid GSTIN that matches the state', () => {
    expect(gstinProblem('', '29')).toBeNull();
    expect(gstinProblem(' 29aabcs1234f1z5 ', '29')).toBeNull();
  });

  it('rejects bad length, bad format and a state mismatch', () => {
    expect(gstinProblem('29AABCS1234F1Z', '29')).toMatch(/15 characters/);
    expect(gstinProblem('29AABCS1234F1X5', '29')).toMatch(/doesn't look like/);
    expect(gstinProblem('29AABCS1234F1Z5', '27')).toMatch(
      /state code 29.*Maharashtra \(27\)/,
    );
  });

  it('knows the GST state codes', () => {
    expect(isGstStateCode('29')).toBe(true);
    expect(isGstStateCode('25')).toBe(false); // retired
    expect(isGstStateCode('Karnataka')).toBe(false);
  });
});

describe('billing details from the org profile', () => {
  const org = {
    name: ' Skyline Developers Pvt Ltd ',
    addressLine1: '4th Floor, Prestige Tech Park',
    addressLine2: '',
    city: 'Bengaluru',
    state: '29',
    postalCode: '560103',
    country: 'India',
    gstin: '29aabcs1234f1z5',
  };

  it('maps the organisation name (as the invoice name), address, city, state code, PIN and GSTIN', () => {
    expect(billingDetailsFromOrg(org)).toEqual({
      legalName: 'Skyline Developers Pvt Ltd',
      addressLine1: '4th Floor, Prestige Tech Park',
      addressLine2: null,
      city: 'Bengaluru',
      state: '29',
      pincode: '560103',
      country: 'IN',
      gstin: '29AABCS1234F1Z5',
    });
    expect(missingBillingDetails(billingDetailsFromOrg(org))).toEqual([]);
  });

  it('lists every required field that is empty; a state that is not a code counts as empty', () => {
    const d = billingDetailsFromOrg({
      ...org,
      name: '  ',
      state: 'Karnataka',
      postalCode: ' ',
      gstin: null,
    });
    expect(d.state).toBe('');
    expect(missingBillingDetails(d)).toEqual(['legalName', 'state', 'pincode']);
    expect(missingBillingDetails(billingDetailsFromOrg(null))).toEqual([
      'legalName',
      'addressLine1',
      'city',
      'state',
      'pincode',
    ]);
  });

  it('treats India (or no country) as IN', () => {
    expect(countryCodeOf('India')).toBe('IN');
    expect(countryCodeOf(null)).toBe('IN');
    expect(countryCodeOf('United Arab Emirates')).toBe('United Arab Emirates');
  });
});

describe('General Settings save: state and GSTIN check', () => {
  it('uses the billing form rules and messages', () => {
    expect(orgTaxDetailsProblem('29', '29AABCS1234F1Z5')).toBeNull();
    expect(orgTaxDetailsProblem('', '')).toBeNull();
    expect(orgTaxDetailsProblem('Karnataka', null)).toMatch(/from the list/);
    expect(orgTaxDetailsProblem('29', '29AABCS1234F1Z')).toMatch(
      /15 characters/,
    );
    expect(orgTaxDetailsProblem('27', '29AABCS1234F1Z5')).toBe(
      'This GSTIN is registered in state code 29, but the state chosen is Maharashtra (27).',
    );
  });

  function prismaWith(before: Record<string, unknown>) {
    const update = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...before,
        ...data,
      }),
    );
    const tx = {
      organisation: {
        findUniqueOrThrow: jest.fn(async () => before),
        update,
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    };
    return { prisma, update };
  }

  it('refuses a GSTIN from another state and saves nothing', async () => {
    const { prisma, update } = prismaWith({
      id: 'org-1',
      state: '27',
      gstin: null,
    });
    await expect(
      updateOrganisationProfile(
        prisma as never,
        'org-1',
        { gstin: '29AABCS1234F1Z5' },
        'u1',
        'org_admin',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('checks a changed state against the stored GSTIN', async () => {
    const { prisma } = prismaWith({
      id: 'org-1',
      state: '29',
      gstin: '29AABCS1234F1Z5',
    });
    await expect(
      updateOrganisationProfile(
        prisma as never,
        'org-1',
        { state: '27' },
        'u1',
        'super_admin',
      ),
    ).rejects.toThrow(/registered in state code 29/);
  });

  it('saves a valid pair, GSTIN upper-cased; an empty GSTIN is stored as null', async () => {
    const { prisma, update } = prismaWith({
      id: 'org-1',
      state: null,
      gstin: null,
    });
    await updateOrganisationProfile(
      prisma as never,
      'org-1',
      { state: '29', gstin: ' 29aabcs1234f1z5 ' },
      'u1',
      'org_admin',
    );
    expect(update.mock.calls[0][0].data).toMatchObject({
      state: '29',
      gstin: '29AABCS1234F1Z5',
    });
    await updateOrganisationProfile(
      prisma as never,
      'org-1',
      { gstin: '' },
      'u1',
      'org_admin',
    );
    expect(update.mock.calls[1][0].data).toMatchObject({ gstin: null });
  });

  it('does not check when neither state nor GSTIN is part of the save', async () => {
    const { prisma, update } = prismaWith({
      id: 'org-1',
      state: 'Karnataka',
      gstin: 'junk',
    });
    await updateOrganisationProfile(
      prisma as never,
      'org-1',
      { name: 'Acme' },
      'u1',
      'org_admin',
    );
    expect(update).toHaveBeenCalled();
  });
});

describe('invoice buyer snapshot', () => {
  const checkout = (id: string): InvoicedCheckout => ({
    id,
    organisationId: 'org-1',
    paymentId: 'pay-1',
    toPlanId: 'growth',
    toInterval: 'monthly',
    kind: 'new',
    subtotalPaise: 200000,
    creditPaise: 0,
    couponDiscountPaise: 0,
    taxablePaise: 200000,
    cgstPaise: 18000,
    sgstPaise: 18000,
    igstPaise: 0,
    totalPaise: 236000,
    buyerLegalName: 'Acme Pvt Ltd',
    buyerGstin: null,
    buyerState: '29',
    sellerSnapshot: { legalName: 'iPixxel' },
  });

  it('copies the org profile at purchase; later General Settings edits never change it', async () => {
    const { db } = createFakeBillingDb({
      plans: [
        {
          id: 'growth',
          name: 'Growth',
          priceMonthly: 2000,
          priceYearly: 20000,
        },
      ],
    });
    giveBillingDetails(db, { city: 'Mysuru', postalCode: '570001' });
    const first = await issueCheckoutInvoice(db as never, checkout('chk-1'));
    expect(first!.buyer).toMatchObject({
      legalName: 'Acme Pvt Ltd',
      addressLine1: '1 Road',
      city: 'Mysuru',
      pincode: '570001',
      state: '29',
    });

    giveBillingDetails(db, {
      addressLine1: '9 New Street',
      city: 'Mangaluru',
      postalCode: '575001',
    });
    const stored = db.invoice.rows.find(
      (r: { id: string }) => r.id === first!.id,
    );
    expect(stored.buyer).toMatchObject({
      addressLine1: '1 Road',
      city: 'Mysuru',
    });

    // A new purchase uses the edited profile.
    const second = await issueCheckoutInvoice(db as never, checkout('chk-2'));
    expect(second!.buyer).toMatchObject({
      addressLine1: '9 New Street',
      city: 'Mangaluru',
    });
  });
});

describe('seller (company tax) settings', () => {
  it('validates what is given and warns when the state is missing', () => {
    const ok = cleanSeller({
      legalName: ' iPixxel ',
      gstin: '29aabcs1234f1z5',
      state: '29',
      pincode: '560001',
    });
    expect(ok).toMatchObject({
      legalName: 'iPixxel',
      gstin: '29AABCS1234F1Z5',
      state: '29',
      city: null,
    });
    expect(sellerProblem(ok)).toBeNull();
    expect(sellerWarnings(ok)).toEqual([]);

    expect(sellerProblem(cleanSeller({ gstin: '29AABCS1234F1Z5' }))).toMatch(
      /state to go with the GSTIN/,
    );
    expect(sellerProblem(cleanSeller({ state: '99' }))).toMatch(
      /company's state/,
    );
    expect(
      sellerProblem(cleanSeller({ state: '27', gstin: '29AABCS1234F1Z5' })),
    ).toMatch(/state code 29/);
    expect(sellerWarnings(cleanSeller({}))[0].code).toBe(
      'seller_state_missing',
    );
  });
});
