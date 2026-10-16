import {
  quoteCheckout,
  QuoteError,
  quoteRenewal,
  roundHalfUp,
  splitGstPaise,
  type QuoteInput,
  type QuotePlan,
} from './checkout-quote';

const DAY = 86_400_000;
const NOW = new Date('2026-10-14T10:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const BASIC: QuotePlan = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  rank: 0,
  isFree: true,
};
const GROWTH: QuotePlan = {
  id: 'growth',
  name: 'Growth',
  priceMonthly: 2000,
  priceYearly: 20000,
  rank: 1,
  isFree: false,
};
const PRO: QuotePlan = {
  id: 'pro',
  name: 'Pro',
  priceMonthly: 5000,
  priceYearly: 50000,
  rank: 2,
  isFree: false,
};

const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  now: NOW,
  target: PRO,
  interval: 'monthly',
  current: {
    plan: GROWTH,
    interval: 'monthly',
    status: 'active',
    renewsAt: at(18),
  },
  buyer: { state: '29', country: 'IN' },
  seller: { state: '29' },
  ...over,
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof QuoteError ? e.code : String(e);
  }
  return 'no error';
};

describe('rounding', () => {
  it('rounds half up in integer arithmetic', () => {
    expect(roundHalfUp(5, 2)).toBe(3); // 2.5 → 3
    expect(roundHalfUp(7, 3)).toBe(2); // 2.33 → 2
    expect(roundHalfUp(8, 3)).toBe(3); // 2.67 → 3
    expect(roundHalfUp(0, 30)).toBe(0);
    expect(() => roundHalfUp(-1, 2)).toThrow();
    expect(() => roundHalfUp(1.5, 2)).toThrow();
  });

  it('computes each GST component on the taxable value, rounded half up', () => {
    // ₹1,741.94 taxable: 9% = 156.7746 → 156.77 each; IGST 18% = 313.5492 → 313.55.
    expect(splitGstPaise(174194, true)).toEqual({
      cgst: 15677,
      sgst: 15677,
      igst: 0,
    });
    expect(splitGstPaise(174194, false)).toEqual({
      cgst: 0,
      sgst: 0,
      igst: 31355,
    });
  });
});

describe('quoteCheckout — kinds and amounts', () => {
  it('new (from Basic): full price, new cycle, CGST+SGST in the same state', () => {
    const q = quoteCheckout(
      input({
        target: GROWTH,
        current: {
          plan: BASIC,
          interval: 'monthly',
          status: 'active',
          renewsAt: at(10),
        },
      }),
    );
    expect(q).toMatchObject({
      kind: 'new',
      subtotalPaise: 200000,
      creditPaise: 0,
      taxablePaise: 200000,
      gstKind: 'intra',
      cgstPaise: 18000,
      sgstPaise: 18000,
      igstPaise: 0,
      totalPaise: 236000,
      proration: null,
    });
    expect(q.periodEnd.toISOString()).toBe(at(30).toISOString());
    expect(q.fromPlan?.id).toBe('basic');
  });

  it('new when there is no subscription, or the paid plan is not active', () => {
    expect(quoteCheckout(input({ current: null })).kind).toBe('new');
    expect(
      quoteCheckout(
        input({
          current: {
            plan: GROWTH,
            interval: 'monthly',
            status: 'past_due',
            renewsAt: at(-2),
          },
        }),
      ).kind,
    ).toBe('new');
  });

  it('upgrade, same interval: pays (new − old) × daysLeft ÷ 30 and keeps renewsAt', () => {
    const q = quoteCheckout(input());
    // (500000 − 200000) × 18 / 30 = 180000 paise
    expect(q).toMatchObject({
      kind: 'upgrade_same_interval',
      subtotalPaise: 500000,
      taxablePaise: 180000,
      creditPaise: 320000,
      totalPaise: 212400,
    });
    expect(q.proration).toEqual({
      oldPricePaise: 200000,
      newPricePaise: 500000,
      daysLeft: 18,
      daysInCycle: 30,
    });
    expect(q.periodEnd.toISOString()).toBe(at(18).toISOString());
  });

  it('upgrade rounding: a third of a paisa rounds half up', () => {
    // (500000 − 200000) × 7 / 30 = 70000 exactly; (5001−2000)… use odd prices:
    const odd = { ...PRO, priceMonthly: 4999 };
    const q = quoteCheckout(
      input({
        target: odd,
        current: {
          plan: GROWTH,
          interval: 'monthly',
          status: 'active',
          renewsAt: at(7),
        },
      }),
    );
    // (499900 − 200000) × 7 / 30 = 69976.67 → 69977
    expect(q.taxablePaise).toBe(69977);
  });

  it('monthly → yearly: yearly price minus the unused monthly credit, new yearly cycle', () => {
    const q = quoteCheckout(input({ target: PRO, interval: 'yearly' }));
    // credit = 200000 × 18 / 30 = 120000; taxable = 5000000 − 120000
    expect(q).toMatchObject({
      kind: 'interval_change',
      subtotalPaise: 5000000,
      creditPaise: 120000,
      taxablePaise: 4880000,
    });
    expect(q.periodEnd.toISOString()).toBe(at(365).toISOString());
    // Same plan, monthly → yearly is also an interval change.
    expect(
      quoteCheckout(input({ target: GROWTH, interval: 'yearly' })).kind,
    ).toBe('interval_change');
  });

  it('other state → IGST; no seller state → IGST with a warning', () => {
    const other = quoteCheckout(
      input({ buyer: { state: '27', country: 'IN' } }),
    );
    expect(other).toMatchObject({
      gstKind: 'inter',
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 32400,
      totalPaise: 212400,
      warnings: [],
    });

    const noSeller = quoteCheckout(input({ seller: { state: null } }));
    expect(noSeller.gstKind).toBe('inter');
    expect(noSeller.warnings.map((w) => w.code)).toEqual([
      'seller_state_missing',
    ]);

    const foreign = quoteCheckout(
      input({ buyer: { state: 'Dubai', country: 'AE' } }),
    );
    expect(foreign.gstKind).toBe('inter');
    expect(foreign.warnings.map((w) => w.code)).toEqual([
      'buyer_outside_india',
    ]);
  });
});

describe('quoteCheckout — rejections', () => {
  it('rejects the current plan, a lower or free plan, and yearly → monthly', () => {
    expect(code(() => quoteCheckout(input({ target: GROWTH })))).toBe(
      'same_plan',
    );
    expect(code(() => quoteCheckout(input({ target: BASIC })))).toBe(
      'free_plan',
    );
    expect(
      code(() =>
        quoteCheckout(
          input({
            target: GROWTH,
            current: {
              plan: PRO,
              interval: 'monthly',
              status: 'active',
              renewsAt: at(5),
            },
          }),
        ),
      ),
    ).toBe('lower_plan');
    expect(
      code(() =>
        quoteCheckout(
          input({
            target: PRO,
            interval: 'monthly',
            current: {
              plan: GROWTH,
              interval: 'yearly',
              status: 'active',
              renewsAt: at(200),
            },
          }),
        ),
      ),
    ).toBe('yearly_to_monthly');
    expect(
      code(() =>
        quoteCheckout(
          input({
            target: GROWTH,
            interval: 'monthly',
            current: {
              plan: GROWTH,
              interval: 'yearly',
              status: 'active',
              renewsAt: at(200),
            },
          }),
        ),
      ),
    ).toBe('yearly_to_monthly');
  });

  it('rejects buying the same plan again while it is lapsed (that is a renewal)', () => {
    expect(
      code(() =>
        quoteCheckout(
          input({
            target: GROWTH,
            current: {
              plan: GROWTH,
              interval: 'monthly',
              status: 'expired',
              renewsAt: at(-20),
            },
          }),
        ),
      ),
    ).toBe('same_plan');
  });
});

describe('quoteRenewal', () => {
  const renewal = (
    current: QuoteInput['current'],
    over: Record<string, unknown> = {},
  ) =>
    quoteRenewal({
      now: NOW,
      current,
      buyer: { state: '27', country: 'IN' },
      seller: { state: '29' },
      notifyDays: 3,
      requested: { planId: 'growth', interval: 'monthly' },
      ...over,
    });
  const growth = (
    status: string,
    renewsAt: Date | null,
    interval: 'monthly' | 'yearly' = 'monthly',
  ) => ({
    plan: GROWTH,
    interval,
    status,
    renewsAt,
  });

  it('full price of the current plan, GST by state, kind renewal, no credit', () => {
    const q = renewal(growth('active', at(2)));
    expect(q).toMatchObject({
      kind: 'renewal',
      subtotalPaise: 200000,
      creditPaise: 0,
      taxablePaise: 200000,
      gstKind: 'inter',
      igstPaise: 36000,
      totalPaise: 236000,
      proration: null,
      fromRenewsAt: at(2),
    });
    expect(q.toPlan.id).toBe('growth');
  });

  it('term: continues from renewsAt before it and in grace; starts now once expired', () => {
    expect(renewal(growth('active', at(2))).periodEnd).toEqual(at(32));
    expect(renewal(growth('past_due', at(-5))).periodEnd).toEqual(at(25));
    expect(renewal(growth('expired', at(-40))).periodEnd).toEqual(at(30));
    // Grace longer than the term: never a term that's already over.
    expect(renewal(growth('past_due', at(-45))).periodEnd).toEqual(at(30));
    expect(
      renewal(growth('active', at(1), 'yearly'), {
        requested: { planId: 'growth', interval: 'yearly' },
      }).periodEnd,
    ).toEqual(at(366));
  });

  it('opens with the reminder (notifyDays before), not earlier', () => {
    expect(code(() => renewal(growth('active', at(3))))).toBe('no error');
    expect(code(() => renewal(growth('active', at(4))))).toBe(
      'renewal_not_due',
    );
  });

  it('refuses the free plan, a cancelled subscription, or another plan / interval', () => {
    expect(code(() => renewal(null))).toBe('nothing_to_renew');
    expect(
      code(() =>
        renewal({
          plan: BASIC,
          interval: 'monthly',
          status: 'active',
          renewsAt: at(1),
        }),
      ),
    ).toBe('nothing_to_renew');
    expect(code(() => renewal(growth('cancelled', at(-1))))).toBe(
      'nothing_to_renew',
    );
    expect(
      code(() =>
        renewal(growth('past_due', at(-1)), {
          requested: { planId: 'pro', interval: 'monthly' },
        }),
      ),
    ).toBe('renewal_plan_mismatch');
    expect(
      code(() =>
        renewal(growth('past_due', at(-1)), {
          requested: { planId: 'growth', interval: 'yearly' },
        }),
      ),
    ).toBe('renewal_plan_mismatch');
  });
});
