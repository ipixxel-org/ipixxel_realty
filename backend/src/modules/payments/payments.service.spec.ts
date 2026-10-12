import { createHmac } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Payment } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PaymentEventsService } from './payment-events';
import { RazorpayGateway, type GatewayPayment } from './razorpay.gateway';
import type { RazorpayConfig } from './razorpay.config';
import type { PrismaService } from '../../database/prisma.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

const TEST_CFG: RazorpayConfig = {
  keyId: 'rzp_test_KEY',
  keySecret: 'key_secret',
  webhookSecret: 'webhook_secret',
  mode: 'test',
};

/**
 * Minimal in-memory Prisma for billing.payments / webhook_events. $transaction
 * runs callbacks one at a time, which is what the real `SELECT … FOR UPDATE`
 * row lock gives fulfilPayment.
 */
function createFakePrisma() {
  const payments = new Map<string, Payment>();
  const webhookEvents = new Map<string, any>();
  const auditLogs: any[] = [];
  let txQueue: Promise<unknown> = Promise.resolve();

  const byOrder = (orderId: string) =>
    [...payments.values()].find((p) => p.razorpayOrderId === orderId) ?? null;

  const matches = (p: Payment, where: any = {}) =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && 'in' in v)
        return v.in.includes((p as any)[k]);
      return (p as any)[k] === v;
    });

  const prisma: any = {
    organisation: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          where.id === ORG || where.id === OTHER_ORG
            ? { id: where.id, name: 'Skyline' }
            : null,
        ),
      ),
    },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          firstName: 'Rohan',
          lastName: 'M',
          email: 'r@x.in',
          phoneNumber: null,
        }),
      ),
    },
    payment: {
      create: jest.fn(({ data }) => {
        const now = new Date();
        const row = {
          status: 'created',
          currency: 'INR',
          referenceType: null,
          referenceId: null,
          notes: null,
          razorpayPaymentId: null,
          razorpaySignature: null,
          failureReason: null,
          capturedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as Payment;
        payments.set(row.id, row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          [...payments.values()].find((p) => matches(p, where)) ?? null,
        ),
      ),
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          where.id
            ? (payments.get(where.id) ?? null)
            : byOrder(where.razorpayOrderId),
        ),
      ),
      findUniqueOrThrow: jest.fn(({ where }) =>
        Promise.resolve(payments.get(where.id)!),
      ),
      update: jest.fn(({ where, data }) => {
        const row = {
          ...payments.get(where.id)!,
          ...data,
          updatedAt: new Date(),
        };
        payments.set(row.id, row);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(({ where, data }) => {
        let count = 0;
        for (const p of payments.values()) {
          if (matches(p, where)) {
            payments.set(p.id, { ...p, ...data });
            count++;
          }
        }
        return Promise.resolve({ count });
      }),
    },
    webhookEvent: {
      create: jest.fn(({ data }) => {
        if (
          [...webhookEvents.values()].some((e) => e.eventId === data.eventId)
        ) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed',
              {
                code: 'P2002',
                clientVersion: 'test',
              },
            ),
          );
        }
        const row = {
          id: `whe_${webhookEvents.size + 1}`,
          processedAt: null,
          error: null,
          ...data,
        };
        webhookEvents.set(row.id, row);
        return Promise.resolve({ id: row.id });
      }),
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(webhookEvents.get(where.id) ?? null),
      ),
      update: jest.fn(({ where, data }) => {
        const row = { ...webhookEvents.get(where.id), ...data };
        webhookEvents.set(where.id, row);
        return Promise.resolve(row);
      }),
    },
    auditLog: {
      create: jest.fn(({ data }) => {
        auditLogs.push(data);
        return Promise.resolve(data);
      }),
    },
    $queryRaw: jest.fn((_strings: TemplateStringsArray, id: string) => {
      const p = payments.get(id);
      return Promise.resolve(
        p ? [{ id: p.id, captured_at: p.capturedAt }] : [],
      );
    }),
  };
  prisma.$transaction = jest.fn((fn: (tx: any) => Promise<unknown>) => {
    const run = txQueue.then(() => fn(prisma));
    txQueue = run.catch(() => undefined);
    return run;
  });

  return { prisma, payments, webhookEvents, auditLogs };
}

function checkoutSig(
  orderId: string,
  paymentId: string,
  secret = TEST_CFG.keySecret,
) {
  return createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function webhookDelivery(body: object, secret = TEST_CFG.webhookSecret) {
  const raw = Buffer.from(JSON.stringify(body));
  return { raw, sig: createHmac('sha256', secret).update(raw).digest('hex') };
}

function capturedEvent(
  orderId: string,
  paymentId: string,
  amount = 100,
  event = 'payment.captured',
) {
  return {
    event,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount,
          currency: 'INR',
          status: 'captured',
        },
      },
      ...(event === 'order.paid' ? { order: { entity: { id: orderId } } } : {}),
    },
  };
}

describe('PaymentsService', () => {
  let fake: ReturnType<typeof createFakePrisma>;
  let gateway: {
    config: jest.Mock;
    enabled: boolean;
    createOrder: jest.Mock;
    fetchPayment: jest.Mock;
  };
  let events: PaymentEventsService;
  let captured: jest.Mock;
  let service: PaymentsService;
  let orderSeq = 0;

  function build(cfg: RazorpayConfig | null = TEST_CFG) {
    fake = createFakePrisma();
    const real = new RazorpayGateway(cfg);
    gateway = {
      config: jest.fn(() => real.config()),
      enabled: real.enabled,
      createOrder: jest.fn((input) =>
        Promise.resolve({
          id: `order_T${++orderSeq}`,
          amount: input.amount,
          currency: input.currency,
        }),
      ),
      fetchPayment: jest.fn(),
    };
    events = new PaymentEventsService();
    captured = jest.fn();
    events.on('payment.captured', captured);
    service = new PaymentsService(
      fake.prisma as unknown as PrismaService,
      gateway as unknown as RazorpayGateway,
      events,
    );
  }

  function remotePayment(over: Partial<GatewayPayment>): GatewayPayment {
    return {
      id: 'pay_1',
      order_id: null,
      amount: 100,
      currency: 'INR',
      status: 'captured',
      ...over,
    };
  }

  async function newOrder(amountPaise = 100, organisationId = ORG) {
    return service.createOrder({
      organisationId,
      amountPaise,
      purpose: 'test',
      createdById: USER,
    });
  }

  beforeEach(() => build());

  // --- createOrder ------------------------------------------------------

  describe('createOrder', () => {
    it('uses the server-supplied amount for both the Razorpay order and the Payment row', async () => {
      const order = await newOrder(49_900);

      expect(gateway.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 49_900,
          currency: 'INR',
          receipt: order.paymentId,
        }),
      );
      const row = fake.payments.get(order.paymentId)!;
      expect(row).toMatchObject({
        amount: 49_900,
        status: 'created',
        razorpayOrderId: order.orderId,
      });
      expect(order).toMatchObject({ amount: 49_900, keyId: 'rzp_test_KEY' });
      expect(gateway.createOrder.mock.calls[0][0].notes).toMatchObject({
        organisationId: ORG,
        paymentId: order.paymentId,
        purpose: 'test',
      });
    });

    it.each([0, 99, 100.5, -100, Number.NaN])(
      'rejects amount %p',
      async (amount) => {
        await expect(newOrder(amount)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(gateway.createOrder).not.toHaveBeenCalled();
      },
    );

    it('returns 503 when Razorpay is not configured', async () => {
      build(null);
      await expect(newOrder()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('createTestOrder', () => {
    it('creates a ₹1 test order in test mode', async () => {
      const order = await service.createTestOrder(ORG, USER);
      expect(order.amount).toBe(100);
      expect(fake.payments.get(order.paymentId)!.purpose).toBe('test');
    });

    it('is forbidden with a live key', async () => {
      build({ ...TEST_CFG, keyId: 'rzp_live_KEY', mode: 'live' });
      await expect(service.createTestOrder(ORG, USER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(gateway.createOrder).not.toHaveBeenCalled();
    });
  });

  // --- verify -----------------------------------------------------------

  describe('verifyCheckout', () => {
    it('captures on a valid signature and emits payment.captured once', async () => {
      const order = await newOrder();
      gateway.fetchPayment.mockResolvedValue(
        remotePayment({ order_id: order.orderId }),
      );

      const res = await service.verifyCheckout(
        {
          razorpay_order_id: order.orderId,
          razorpay_payment_id: 'pay_1',
          razorpay_signature: checkoutSig(order.orderId, 'pay_1'),
        },
        ORG,
      );

      expect(res.status).toBe('captured');
      expect(res).not.toHaveProperty('razorpaySignature');
      expect(fake.payments.get(order.paymentId)!.capturedAt).toBeInstanceOf(
        Date,
      );
      expect(captured).toHaveBeenCalledTimes(1);
      expect(captured.mock.calls[0][0]).toMatchObject({
        paymentId: order.paymentId,
        purpose: 'test',
      });
    });

    it('rejects an invalid signature and leaves the payment untouched', async () => {
      const order = await newOrder();
      await expect(
        service.verifyCheckout(
          {
            razorpay_order_id: order.orderId,
            razorpay_payment_id: 'pay_1',
            razorpay_signature: checkoutSig(
              order.orderId,
              'pay_1',
              'wrong_secret',
            ),
          },
          ORG,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fake.payments.get(order.paymentId)!.status).toBe('created');
      expect(gateway.fetchPayment).not.toHaveBeenCalled();
      expect(captured).not.toHaveBeenCalled();
    });

    it("does not find another organisation's payment", async () => {
      const order = await newOrder(100, OTHER_ORG);
      await expect(
        service.verifyCheckout(
          {
            razorpay_order_id: order.orderId,
            razorpay_payment_id: 'pay_1',
            razorpay_signature: checkoutSig(order.orderId, 'pay_1'),
          },
          ORG,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks an authorised-but-not-captured payment pending', async () => {
      const order = await newOrder();
      gateway.fetchPayment.mockResolvedValue(
        remotePayment({ order_id: order.orderId, status: 'authorized' }),
      );
      const res = await service.verifyCheckout(
        {
          razorpay_order_id: order.orderId,
          razorpay_payment_id: 'pay_1',
          razorpay_signature: checkoutSig(order.orderId, 'pay_1'),
        },
        ORG,
      );
      expect(res.status).toBe('pending');
      expect(captured).not.toHaveBeenCalled();
    });
  });

  // --- fulfil idempotency -----------------------------------------------

  describe('fulfilPayment idempotency', () => {
    it('verify and webhook arriving together capture once and emit once', async () => {
      const order = await newOrder();
      gateway.fetchPayment.mockResolvedValue(
        remotePayment({ order_id: order.orderId }),
      );
      const { raw, sig } = webhookDelivery(
        capturedEvent(order.orderId, 'pay_1'),
      );

      const ingested = await service.ingestWebhook(raw, sig, 'evt_1');
      await Promise.all([
        service.verifyCheckout(
          {
            razorpay_order_id: order.orderId,
            razorpay_payment_id: 'pay_1',
            razorpay_signature: checkoutSig(order.orderId, 'pay_1'),
          },
          ORG,
        ),
        service.processWebhookEvent(ingested.webhookEventId!),
      ]);

      expect(captured).toHaveBeenCalledTimes(1);
      expect(
        fake.auditLogs.filter((a) => a.action === 'payment_captured'),
      ).toHaveLength(1);
      expect(fake.payments.get(order.paymentId)!.status).toBe('captured');
      expect(
        fake.webhookEvents.get(ingested.webhookEventId!)!.processedAt,
      ).toBeInstanceOf(Date);
    });

    it('payment.captured and order.paid for the same payment capture once', async () => {
      const order = await newOrder();
      for (const [evt, id] of [
        ['payment.captured', 'evt_a'],
        ['order.paid', 'evt_b'],
      ]) {
        const { raw, sig } = webhookDelivery(
          capturedEvent(order.orderId, 'pay_1', 100, evt),
        );
        const { webhookEventId } = await service.ingestWebhook(raw, sig, id);
        await service.processWebhookEvent(webhookEventId!);
      }
      expect(captured).toHaveBeenCalledTimes(1);
    });

    it('calling fulfilPayment twice returns the captured row without re-emitting', async () => {
      const order = await newOrder();
      const first = await service.fulfilPayment(order.paymentId, {
        razorpayPaymentId: 'pay_1',
      });
      const second = await service.fulfilPayment(order.paymentId, {
        razorpayPaymentId: 'pay_1',
      });
      expect(second.capturedAt).toEqual(first.capturedAt);
      expect(captured).toHaveBeenCalledTimes(1);
    });
  });

  // --- webhooks ---------------------------------------------------------

  describe('webhooks', () => {
    it('stores and processes the same event id only once', async () => {
      const order = await newOrder();
      const { raw, sig } = webhookDelivery(
        capturedEvent(order.orderId, 'pay_1'),
      );

      const first = await service.ingestWebhook(raw, sig, 'evt_dup');
      const second = await service.ingestWebhook(raw, sig, 'evt_dup');
      expect(first.duplicate).toBe(false);
      expect(second).toEqual({ webhookEventId: null, duplicate: true });

      await service.processWebhookEvent(first.webhookEventId!);
      await service.processWebhookEvent(first.webhookEventId!); // already processed
      expect(fake.webhookEvents.size).toBe(1);
      expect(captured).toHaveBeenCalledTimes(1);
    });

    it('rejects a bad signature without storing anything', async () => {
      const { raw } = webhookDelivery({ event: 'payment.captured' });
      const forged = webhookDelivery(
        { event: 'payment.captured' },
        'not_the_secret',
      ).sig;
      await expect(
        service.ingestWebhook(raw, forged, 'evt_x'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fake.webhookEvents.size).toBe(0);
    });

    it('records an amount mismatch on the event row instead of capturing', async () => {
      const order = await newOrder(100);
      const { raw, sig } = webhookDelivery(
        capturedEvent(order.orderId, 'pay_1', 1),
      );
      const { webhookEventId } = await service.ingestWebhook(raw, sig, 'evt_m');
      await service.processWebhookEvent(webhookEventId!);

      expect(fake.payments.get(order.paymentId)!.status).toBe('created');
      expect(fake.webhookEvents.get(webhookEventId!)).toMatchObject({
        processedAt: null,
        error: expect.stringMatching(/Amount mismatch/),
      });
    });

    it('payment.failed marks the payment failed, but never after capture', async () => {
      const order = await newOrder();
      const failed = {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_f',
              order_id: order.orderId,
              error_description: 'Card declined',
            },
          },
        },
      };
      let d = webhookDelivery(failed);
      let r = await service.ingestWebhook(d.raw, d.sig, 'evt_f1');
      await service.processWebhookEvent(r.webhookEventId!);
      expect(fake.payments.get(order.paymentId)).toMatchObject({
        status: 'failed',
        failureReason: 'Card declined',
      });

      await service.fulfilPayment(order.paymentId, {
        razorpayPaymentId: 'pay_ok',
      });
      d = webhookDelivery(failed);
      r = await service.ingestWebhook(d.raw, d.sig, 'evt_f2');
      await service.processWebhookEvent(r.webhookEventId!);
      expect(fake.payments.get(order.paymentId)!.status).toBe('captured');
    });

    it('refund.processed records a full refund', async () => {
      const order = await newOrder();
      await service.fulfilPayment(order.paymentId, {
        razorpayPaymentId: 'pay_r',
      });
      const { raw, sig } = webhookDelivery({
        event: 'refund.processed',
        payload: {
          refund: {
            entity: { id: 'rfnd_1', payment_id: 'pay_r', amount: 100 },
          },
          payment: {
            entity: { id: 'pay_r', amount: 100, amount_refunded: 100 },
          },
        },
      });
      const { webhookEventId } = await service.ingestWebhook(raw, sig, 'evt_r');
      await service.processWebhookEvent(webhookEventId!);
      expect(fake.payments.get(order.paymentId)!.status).toBe('refunded');
    });
  });
});
