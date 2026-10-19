import { BadRequestException } from '@nestjs/common';
import { AdminBillingService } from './admin-billing.service';
import { IntegrationsService } from '../integrations/integrations.service';

/**
 * Integrations → Online payments: the switch reads and writes
 * online_payments_enabled, can't be turned on without a usable gateway, and
 * the integrations status grid reports both.
 */
function setup(opts: { enabled: boolean; razorpayReady: boolean }) {
  const store = { onlinePaymentsEnabled: opts.enabled };
  const platformConfig = {
    getOnlinePaymentsEnabled: jest.fn(() =>
      Promise.resolve(store.onlinePaymentsEnabled),
    ),
    updateConfig: jest.fn((dto: { onlinePaymentsEnabled?: boolean }) => {
      if (dto.onlinePaymentsEnabled !== undefined)
        store.onlinePaymentsEnabled = dto.onlinePaymentsEnabled;
      return Promise.resolve({});
    }),
  };
  const razorpay = {
    resolve: jest.fn(() =>
      Promise.resolve(
        opts.razorpayReady
          ? {
              source: 'database',
              isActive: true,
              config: {
                keyId: 'rzp_test_x',
                keySecret: 's',
                webhookSecret: 'w',
                mode: 'test',
              },
            }
          : { source: null, isActive: true, config: null },
      ),
    ),
  };
  const service = new AdminBillingService(
    {} as never,
    platformConfig as never,
    {} as never,
    razorpay as never,
  );
  const integrations = new IntegrationsService(
    {} as never,
    {} as never,
    {} as never,
    razorpay as never,
    {} as never,
    platformConfig as never,
  );
  return { store, platformConfig, service, integrations };
}

const viewPaymentsOnly = { sub: 'u1', roles: ['super_admin'] } as never;

describe('Online payments switch', () => {
  it('reads online_payments_enabled with the effective mode and gateway', async () => {
    const { service } = setup({ enabled: true, razorpayReady: true });
    await expect(service.getOnlinePayments()).resolves.toEqual({
      enabled: true,
      paymentMode: 'online',
      paymentModeReason: null,
      gateway: 'razorpay',
    });
  });

  it('writes online_payments_enabled, and only that', async () => {
    const { store, platformConfig, service } = setup({
      enabled: false,
      razorpayReady: true,
    });
    const res = await service.saveOnlinePayments(true);
    expect(platformConfig.updateConfig).toHaveBeenCalledWith({
      onlinePaymentsEnabled: true,
    });
    expect(store.onlinePaymentsEnabled).toBe(true);
    expect(res.paymentMode).toBe('online');

    await service.saveOnlinePayments(false);
    expect(store.onlinePaymentsEnabled).toBe(false);
  });

  it("can't be turned on without a gateway with usable keys, but can be turned off", async () => {
    const { store, platformConfig, service } = setup({
      enabled: true,
      razorpayReady: false,
    });
    await expect(service.saveOnlinePayments(true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(platformConfig.updateConfig).not.toHaveBeenCalled();

    const res = await service.saveOnlinePayments(false);
    expect(store.onlinePaymentsEnabled).toBe(false);
    expect(res).toMatchObject({ enabled: false, gateway: null });
  });
});

describe('GET /admin/integrations/status — online payments', () => {
  const payments = async (o: { enabled: boolean; razorpayReady: boolean }) => {
    const { integrations } = setup(o);
    // Only the payments entry is under test; the other integrations' services are stubs.
    (
      integrations as unknown as {
        viewableModules: () => Promise<(m: string) => boolean>;
      }
    ).viewableModules = () =>
      Promise.resolve((m: string) => m === 'admin_subscriptions');
    const rows = await integrations.status(viewPaymentsOnly);
    return rows.find((r) => r.key === 'payments');
  };

  it('reflects both the switch and the gateway', async () => {
    await expect(
      payments({ enabled: true, razorpayReady: true }),
    ).resolves.toEqual({
      key: 'payments',
      configured: true,
      active: true,
      enabled: true,
      gateway: 'razorpay',
    });
    await expect(
      payments({ enabled: false, razorpayReady: true }),
    ).resolves.toMatchObject({
      configured: true,
      active: false,
      enabled: false,
    });
    await expect(
      payments({ enabled: true, razorpayReady: false }),
    ).resolves.toMatchObject({
      configured: false,
      active: false,
      enabled: true,
      gateway: null,
    });
  });

  it('no longer reports a separate razorpay entry', async () => {
    const { integrations } = setup({ enabled: false, razorpayReady: true });
    (
      integrations as unknown as {
        viewableModules: () => Promise<(m: string) => boolean>;
      }
    ).viewableModules = () =>
      Promise.resolve((m: string) => m === 'admin_subscriptions');
    const rows = await integrations.status(viewPaymentsOnly);
    expect(rows.map((r) => r.key)).toEqual(['payments']);
  });
});
