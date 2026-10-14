import { BadRequestException } from '@nestjs/common';
import {
  cleanSeller,
  sellerProblem,
  sellerWarnings,
} from './admin-billing.service';
import {
  BillingProfileService,
  billingProfileProblem,
} from './billing-profile.service';
import type { SaveBillingProfileDto } from './dto/save-billing-profile.dto';
import { gstinProblem, isGstStateCode } from './gst';

const profile = (
  over: Partial<SaveBillingProfileDto> = {},
): SaveBillingProfileDto => ({
  legalName: 'Skyline Developers Pvt Ltd',
  addressLine1: '4th Floor, Prestige Tech Park',
  addressLine2: null,
  city: 'Bengaluru',
  state: '29',
  pincode: '560103',
  country: 'IN',
  gstin: '29AABCS1234F1Z5',
  ...over,
});

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

describe('billingProfileProblem', () => {
  it('accepts a complete Indian profile, with or without a GSTIN', () => {
    expect(billingProfileProblem(profile())).toBeNull();
    expect(billingProfileProblem(profile({ gstin: null }))).toBeNull();
  });

  it('explains what is missing or wrong', () => {
    expect(billingProfileProblem(profile({ legalName: ' ' }))).toMatch(
      /legal name/,
    );
    expect(billingProfileProblem(profile({ addressLine1: '' }))).toMatch(
      /address/,
    );
    expect(billingProfileProblem(profile({ city: '' }))).toMatch(/city/);
    expect(billingProfileProblem(profile({ state: 'Karnataka' }))).toMatch(
      /Choose the state/,
    );
    expect(billingProfileProblem(profile({ pincode: '0123' }))).toMatch(
      /6-digit/,
    );
    expect(billingProfileProblem(profile({ state: '27' }))).toMatch(
      /state code 29/,
    );
  });

  it('accepts a foreign address without a GSTIN (charged IGST for now)', () => {
    const foreign = profile({
      country: 'AE',
      state: 'Dubai',
      pincode: '00000',
      gstin: null,
    });
    expect(billingProfileProblem(foreign)).toBeNull();
    expect(
      billingProfileProblem({ ...foreign, gstin: '29AABCS1234F1Z5' }),
    ).toMatch(/only applies to Indian/);
  });
});

describe('BillingProfileService', () => {
  it('normalises and upserts the profile; refuses an invalid one', async () => {
    const upsert = jest.fn(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({ ...create }),
    );
    const service = new BillingProfileService({
      billingProfile: { upsert },
    } as never);
    const saved = await service.save(
      'org-1',
      profile({ gstin: '29aabcs1234f1z5', addressLine2: '  ' }),
    );
    expect(saved).toMatchObject({
      gstin: '29AABCS1234F1Z5',
      addressLine2: null,
      country: 'IN',
      state: '29',
    });
    await expect(
      service.save('org-1', profile({ pincode: '1' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).toHaveBeenCalledTimes(1);
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
