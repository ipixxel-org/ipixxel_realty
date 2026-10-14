import { BillingModeService, decideBillingMode } from './billing-mode.service';

describe('decideBillingMode', () => {
  // Every combination of switch × keys × console on/off.
  const cases: [boolean, boolean, boolean, string, string | null][] = [
    [false, false, false, 'manual', 'switched_off'],
    [false, false, true, 'manual', 'switched_off'],
    [false, true, false, 'manual', 'switched_off'],
    [false, true, true, 'manual', 'switched_off'],
    [true, false, false, 'manual', 'gateway_disabled'],
    [true, true, false, 'manual', 'gateway_disabled'],
    [true, false, true, 'manual', 'keys_missing'],
    [true, true, true, 'online', null],
  ];
  it.each(cases)(
    'enabled=%s configured=%s active=%s → %s (%s)',
    (enabled, razorpayConfigured, razorpayActive, mode, reason) => {
      expect(
        decideBillingMode({ enabled, razorpayConfigured, razorpayActive }),
      ).toEqual({ mode, reason });
    },
  );
});

describe('BillingModeService', () => {
  const make = (enabled: boolean | Error, resolved: unknown) =>
    new BillingModeService(
      {
        getOnlinePaymentsEnabled: () =>
          enabled instanceof Error
            ? Promise.reject(enabled)
            : Promise.resolve(enabled),
      } as never,
      {
        resolve: () =>
          resolved instanceof Error
            ? Promise.reject(resolved)
            : Promise.resolve(resolved),
      } as never,
    );
  const keys = {
    keyId: 'rzp_test_x',
    keySecret: 's',
    webhookSecret: 'w',
    mode: 'test',
  };

  it('is online with the switch on and usable keys', async () => {
    await expect(
      make(true, {
        config: keys,
        isActive: true,
        source: 'database',
      }).getMode(),
    ).resolves.toEqual({ mode: 'online', reason: null });
  });

  it('is manual when keys are missing, the gateway is off, or the switch is off', async () => {
    await expect(
      make(true, { config: null, isActive: true, source: null }).getMode(),
    ).resolves.toEqual({ mode: 'manual', reason: 'keys_missing' });
    await expect(
      make(true, {
        config: null,
        isActive: false,
        source: 'database',
      }).getMode(),
    ).resolves.toEqual({ mode: 'manual', reason: 'gateway_disabled' });
    await expect(
      make(false, { config: keys, isActive: true, source: 'env' }).getMode(),
    ).resolves.toEqual({ mode: 'manual', reason: 'switched_off' });
  });

  it('falls back to manual when the Razorpay settings cannot be read', async () => {
    await expect(make(true, new Error('db down')).getMode()).resolves.toEqual({
      mode: 'manual',
      reason: 'keys_missing',
    });
  });
});
