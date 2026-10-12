import { BadRequestException } from '@nestjs/common';
import {
  RazorpaySettingsService,
  SECRET_MASK,
} from './razorpay-settings.service';
import type { RazorpayConfig } from './razorpay.config';
import type { PrismaService } from '../../database/prisma.service';

const ENV_CFG: RazorpayConfig = {
  keyId: 'rzp_test_ENV',
  keySecret: 'env_secret',
  webhookSecret: 'env_whsec',
  mode: 'test',
};

type Row = {
  id: string;
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
  isActive: boolean;
  updatedById: string | null;
  updatedAt: Date;
};

function fakePrisma(initial: Partial<Row> | null = null) {
  let row: Row | null = initial
    ? {
        id: 'default',
        keyId: null,
        keySecret: null,
        webhookSecret: null,
        isActive: true,
        updatedById: null,
        updatedAt: new Date(),
        ...initial,
      }
    : null;
  const audit: Array<Record<string, unknown>> = [];
  const prisma = {
    razorpaySettings: {
      findUnique: jest.fn(() => Promise.resolve(row)),
      upsert: jest.fn(
        ({ create, update }: { create: Row; update: Partial<Row> }) => {
          row = row
            ? { ...row, ...update, updatedAt: new Date() }
            : { ...create, updatedAt: new Date() };
          return Promise.resolve(row);
        },
      ),
      deleteMany: jest.fn(() => {
        row = null;
        return Promise.resolve({ count: 1 });
      }),
    },
    auditLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return Promise.resolve(data);
      }),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  };
  return { prisma, audit, getRow: () => row };
}

function build(row: Partial<Row> | null, env: RazorpayConfig | null = null) {
  const f = fakePrisma(row);
  const service = new RazorpaySettingsService(
    f.prisma as unknown as PrismaService,
    env,
  );
  return { ...f, service };
}

const FULL_DB = {
  keyId: 'rzp_test_DB',
  keySecret: 'db_secret',
  webhookSecret: 'db_whsec',
};

describe('RazorpaySettingsService', () => {
  describe('resolve', () => {
    it('prefers console keys over the env fallback', async () => {
      const { service } = build(FULL_DB, ENV_CFG);
      const r = await service.resolve();
      expect(r.source).toBe('database');
      expect(r.config).toMatchObject({ keyId: 'rzp_test_DB', mode: 'test' });
    });

    it('falls back to env when no console keys are saved', async () => {
      const { service } = build(null, ENV_CFG);
      expect(await service.resolve()).toEqual({
        source: 'env',
        isActive: true,
        config: ENV_CFG,
      });
    });

    it('returns no config when switched off', async () => {
      const { service } = build({ ...FULL_DB, isActive: false });
      const r = await service.resolve();
      expect(r).toMatchObject({
        source: 'database',
        isActive: false,
        config: null,
      });
    });

    it('returns no config when the console row is incomplete', async () => {
      const { service } = build({ keyId: 'rzp_test_DB', keySecret: 'x' });
      expect((await service.resolve()).config).toBeNull();
    });
  });

  describe('getForAdmin', () => {
    it('never returns secrets', async () => {
      const { service } = build(FULL_DB);
      const view = await service.getForAdmin();
      expect(view).toMatchObject({
        keyId: 'rzp_test_DB',
        keySecret: SECRET_MASK,
        webhookSecret: SECRET_MASK,
        hasKeySecret: true,
        hasWebhookSecret: true,
        configured: true,
        ready: true,
        mode: 'test',
      });
      expect(JSON.stringify(view)).not.toContain('db_secret');
      expect(JSON.stringify(view)).not.toContain('db_whsec');
    });

    it('does not leak env secrets either', async () => {
      const { service } = build(null, ENV_CFG);
      const json = JSON.stringify(await service.getForAdmin());
      expect(json).not.toContain('env_secret');
      expect(json).not.toContain('env_whsec');
    });
  });

  describe('update', () => {
    it('keeps stored secrets when the form sends the mask or blank', async () => {
      const { service, getRow } = build(FULL_DB);
      await service.update(
        { keyId: 'rzp_test_DB', keySecret: SECRET_MASK, webhookSecret: '' },
        'admin-1',
      );
      expect(getRow()).toMatchObject(FULL_DB);
    });

    it('applies new secrets and takes effect without a restart', async () => {
      const { service } = build(FULL_DB);
      await service.resolve(); // warm the cache
      await service.update(
        { keySecret: 'new_secret', webhookSecret: 'new_whsec' },
        'admin-1',
      );
      expect((await service.current())?.keySecret).toBe('new_secret');
    });

    it('requires the matching secret when the key id changes', async () => {
      const { service } = build(FULL_DB);
      await expect(
        service.update(
          { keyId: 'rzp_live_OTHER', keySecret: SECRET_MASK },
          'a',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires all three on first save', async () => {
      const { service } = build(null);
      await expect(
        service.update({ keyId: 'rzp_test_A', keySecret: 's' }, 'a'),
      ).rejects.toThrow(/Webhook Secret/);
    });

    it.each(['pk_test_123', 'rzp_test_', 'rzp_prod_ABC'])(
      'rejects malformed key id %p',
      async (keyId) => {
        const { service } = build(null);
        await expect(
          service.update({ keyId, keySecret: 's', webhookSecret: 'w' }, 'a'),
        ).rejects.toThrow(/rzp_test_ or rzp_live_/);
      },
    );

    it('audits which fields changed without storing secret values', async () => {
      const { service, audit } = build(FULL_DB);
      await service.update({ keySecret: 'brand_new_secret' }, 'admin-1');
      expect(audit[0]).toMatchObject({
        actorId: 'admin-1',
        action: 'razorpay_settings_updated',
        metadata: { changed: { keySecret: true, webhookSecret: false } },
      });
      expect(JSON.stringify(audit)).not.toContain('brand_new_secret');
    });

    it('refuses a webhook secret equal to the public key id', async () => {
      const { service } = build(FULL_DB);
      await expect(
        service.update({ webhookSecret: 'rzp_test_DB' }, 'a'),
      ).rejects.toThrow(/must not be the Key ID/);
    });

    it('treats an already-stored unsafe webhook secret as not usable', async () => {
      const { service } = build({ ...FULL_DB, webhookSecret: 'rzp_test_DB' });
      expect(await service.current()).toBeNull();
    });

    it('can switch payments off', async () => {
      const { service } = build(FULL_DB);
      await service.update({ isActive: false }, 'a');
      expect(await service.current()).toBeNull();
    });
  });

  it('clear() removes console keys and falls back to env', async () => {
    const { service } = build(FULL_DB, ENV_CFG);
    await service.clear('a');
    expect((await service.resolve()).source).toBe('env');
  });
});
