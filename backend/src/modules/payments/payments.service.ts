import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Payment, PaymentPurpose } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { RazorpayGateway } from './razorpay.gateway';
import {
  isValidCheckoutSignature,
  isValidWebhookSignature,
} from './razorpay-signature.util';
import {
  PaymentEventsService,
  type PaymentEvent,
  type PaymentEventName,
} from './payment-events';
import type {
  AdminListPaymentsQueryDto,
  ListPaymentsQueryDto,
  VerifyPaymentDto,
} from './dto/payments.dto';

export interface CreateOrderInput {
  organisationId: string;
  /** Integer paise, computed by the calling service — never by the client. */
  amountPaise: number;
  currency?: string;
  purpose: PaymentPurpose;
  referenceType?: string;
  referenceId?: string;
  notes?: Record<string, string>;
  createdById: string;
}

/** What the frontend needs to open Razorpay Checkout. */
export interface CheckoutOrder {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
}

/** Razorpay's minimum order amount is ₹1 (100 paise). */
export const MIN_AMOUNT_PAISE = 100;
export const TEST_PAYMENT_AMOUNT_PAISE = 100;

const HANDLED_WEBHOOK_EVENTS = new Set([
  'payment.captured',
  'order.paid',
  'payment.failed',
  'refund.processed',
]);

// Razorpay rejects notes with more than 15 keys or values over 256 chars.
const MAX_NOTE_KEYS = 15;
const MAX_NOTE_LENGTH = 256;

// The subset of Razorpay webhook entity fields we read.
interface RazorpayEntity {
  id?: string;
  order_id?: string | null;
  payment_id?: string;
  amount?: number;
  amount_refunded?: number;
  currency?: string;
  error_code?: string | null;
  error_reason?: string | null;
  error_description?: string | null;
}
interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayEntity };
    order?: { entity?: RazorpayEntity };
    refund?: { entity?: RazorpayEntity };
  };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RazorpayGateway,
    private readonly events: PaymentEventsService,
  ) {}

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  /**
   * Create a Razorpay Order and its Payment row. Internal API for other
   * services — the amount always comes from server-side data. The Payment id
   * is generated first and used as the order receipt so the two can be tied
   * together from either side.
   */
  async createOrder(input: CreateOrderInput): Promise<CheckoutOrder> {
    const cfg = await this.gateway.config();

    const amount = input.amountPaise;
    if (!Number.isSafeInteger(amount) || amount < MIN_AMOUNT_PAISE) {
      throw new BadRequestException(
        `Payment amount must be a whole number of paise, at least ${MIN_AMOUNT_PAISE}.`,
      );
    }
    const currency = (input.currency ?? 'INR').toUpperCase();

    const [org, creator] = await Promise.all([
      this.prisma.organisation.findUnique({
        where: { id: input.organisationId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: input.createdById },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
        },
      }),
    ]);
    if (!org) throw new NotFoundException('Organisation not found');
    if (!creator) throw new NotFoundException('User not found');

    const paymentId = randomUUID();
    const notes = buildOrderNotes(paymentId, input);

    const order = await this.gateway.createOrder({
      amount,
      currency,
      receipt: paymentId,
      notes,
    });

    await this.prisma.payment.create({
      data: {
        id: paymentId,
        organisationId: org.id,
        amount,
        currency,
        status: 'created',
        purpose: input.purpose,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? undefined,
        razorpayOrderId: order.id,
        createdById: input.createdById,
      },
    });

    const name = [creator.firstName, creator.lastName]
      .filter(Boolean)
      .join(' ');
    return {
      paymentId,
      orderId: order.id,
      amount,
      currency,
      keyId: cfg.keyId,
      name: org.name,
      description: describePurpose(input.purpose),
      prefill: {
        name: name || undefined,
        email: creator.email ?? undefined,
        contact: creator.phoneNumber ?? undefined,
      },
    };
  }

  /** Super Admin ₹1 test order. Only in Razorpay test mode. */
  async createTestOrder(organisationId: string, createdById: string) {
    await this.assertTestMode();
    return this.createOrder({
      organisationId,
      amountPaise: TEST_PAYMENT_AMOUNT_PAISE,
      purpose: 'test',
      referenceType: 'test',
      createdById,
    });
  }

  async assertTestMode(): Promise<void> {
    if ((await this.gateway.config()).mode !== 'test') {
      throw new ForbiddenException(
        'Test payments are only available with a Razorpay test key (rzp_test_…).',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Checkout verification
  // -------------------------------------------------------------------------

  /**
   * Verify the Checkout success callback. `organisationId` scopes the lookup
   * for org callers; Super Admin passes null. The signature proves Razorpay
   * authorised this payment for this order; we then ask Razorpay for the
   * payment's actual state, because with manual capture an authorised
   * payment is not money yet — that case is left `pending` and the
   * payment.captured webhook finishes it.
   */
  async verifyCheckout(dto: VerifyPaymentDto, organisationId: string | null) {
    const cfg = await this.gateway.config();

    const payment = await this.prisma.payment.findFirst({
      where: {
        razorpayOrderId: dto.razorpay_order_id,
        ...(organisationId ? { organisationId } : {}),
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (
      !isValidCheckoutSignature(
        dto.razorpay_order_id,
        dto.razorpay_payment_id,
        dto.razorpay_signature,
        cfg.keySecret,
      )
    ) {
      throw new BadRequestException('Payment signature verification failed');
    }

    if (payment.capturedAt) return toPublicPayment(payment);

    const remote = await this.gateway.fetchPayment(dto.razorpay_payment_id);
    if (remote.order_id !== payment.razorpayOrderId) {
      throw new BadRequestException('Payment does not belong to this order');
    }
    assertAmountMatches(payment, remote.amount, remote.currency);

    if (remote.status === 'captured') {
      const captured = await this.fulfilPayment(payment.id, {
        razorpayPaymentId: dto.razorpay_payment_id,
        razorpaySignature: dto.razorpay_signature,
      });
      return toPublicPayment(captured);
    }
    if (remote.status !== 'authorized') {
      // A valid signature is only issued for a successful payment, so this
      // is an anomaly (e.g. refunded already); leave it to the webhooks.
      return toPublicPayment(payment);
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: payment.status === 'created' ? 'pending' : payment.status,
        razorpayPaymentId: dto.razorpay_payment_id,
        razorpaySignature: dto.razorpay_signature,
      },
    });
    return toPublicPayment(updated);
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  /**
   * Mark a payment captured. Idempotent: the row is locked (SELECT … FOR
   * UPDATE) and `capturedAt` is the marker, so when /verify and the webhook
   * race, exactly one of them captures and emits `payment.captured`; the
   * other gets the already-captured row back.
   */
  async fulfilPayment(
    paymentId: string,
    attrs: { razorpayPaymentId: string; razorpaySignature?: string },
  ): Promise<Payment> {
    const { payment, changed } = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; captured_at: Date | null }>
      >`
        SELECT id, captured_at FROM "billing"."payments" WHERE id = ${paymentId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Payment not found');

      if (locked[0].captured_at) {
        const existing = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        return { payment: existing, changed: false };
      }

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'captured',
          capturedAt: new Date(),
          razorpayPaymentId: attrs.razorpayPaymentId,
          ...(attrs.razorpaySignature
            ? { razorpaySignature: attrs.razorpaySignature }
            : {}),
          failureReason: null,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: updated.organisationId,
          actorId: null,
          action: 'payment_captured',
          entity: 'Payment',
          entityId: updated.id,
          metadata: {
            amount: updated.amount,
            currency: updated.currency,
            purpose: updated.purpose,
            referenceType: updated.referenceType,
            referenceId: updated.referenceId,
            razorpayPaymentId: attrs.razorpayPaymentId,
          },
        },
      });

      return { payment: updated, changed: true };
    });

    if (changed) await this.emit('payment.captured', payment);
    return payment;
  }

  /**
   * Record a failed attempt. Never downgrades a captured/refunded payment:
   * Checkout lets the payer retry on the same order, so a failure can arrive
   * after (or alongside) a successful attempt.
   */
  async recordFailure(
    razorpayOrderId: string,
    razorpayPaymentId: string | null,
    reason: string,
  ): Promise<Payment | null> {
    const { count } = await this.prisma.payment.updateMany({
      where: {
        razorpayOrderId,
        capturedAt: null,
        status: { in: ['created', 'pending', 'failed'] },
      },
      data: {
        status: 'failed',
        failureReason: reason.slice(0, 500),
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
      },
    });
    if (count === 0) return null;

    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId },
    });
    if (payment) await this.emit('payment.failed', payment);
    return payment;
  }

  /** Full refund -> `refunded`. Partial refunds are not tracked yet (TODO). */
  async recordRefund(
    razorpayPaymentId: string,
    paymentEntity?: RazorpayEntity,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { razorpayPaymentId },
    });
    if (!payment)
      throw new Error(`No payment with razorpayPaymentId ${razorpayPaymentId}`);

    const refunded = Number(paymentEntity?.amount_refunded ?? payment.amount);
    if (refunded < payment.amount || payment.status === 'refunded')
      return payment;

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'refunded' },
    });
    await this.emit('payment.refunded', updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /**
   * Verify + store a webhook delivery. Returns the stored row id to process,
   * or null for a duplicate (same x-razorpay-event-id seen before). Throws
   * BadRequest on a bad signature so Razorpay sees a non-2xx.
   */
  async ingestWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    eventIdHeader: string | undefined,
  ): Promise<{ webhookEventId: string | null; duplicate: boolean }> {
    const cfg = await this.gateway.config();
    if (!isValidWebhookSignature(rawBody, signature, cfg.webhookSecret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let body: RazorpayWebhookBody;
    try {
      body = JSON.parse(rawBody!.toString('utf8')) as RazorpayWebhookBody;
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    // Razorpay always sends x-razorpay-event-id; fall back to a body hash so
    // an odd delivery is still deduped rather than processed twice.
    const eventId =
      eventIdHeader?.trim() ||
      `sha256:${createHash('sha256').update(rawBody!).digest('hex')}`;

    try {
      const row = await this.prisma.webhookEvent.create({
        data: {
          provider: 'razorpay',
          eventId,
          type: String(body.event ?? 'unknown'),
          payload: body as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return { webhookEventId: row.id, duplicate: false };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { webhookEventId: null, duplicate: true };
      }
      throw err;
    }
  }

  /** Process a stored webhook event; outcome is written back to the row. */
  async processWebhookEvent(webhookEventId: string): Promise<void> {
    const row = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });
    if (!row || row.processedAt) return;

    try {
      await this.applyWebhook(row.type, row.payload as RazorpayWebhookBody);
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { processedAt: new Date(), error: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Razorpay webhook ${row.eventId} (${row.type}) failed: ${message}`,
      );
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { error: message.slice(0, 2000) },
      });
    }
  }

  private async applyWebhook(
    type: string,
    body: RazorpayWebhookBody,
  ): Promise<void> {
    if (!HANDLED_WEBHOOK_EVENTS.has(type)) return;

    const paymentEntity = body.payload?.payment?.entity;
    const orderEntity = body.payload?.order?.entity;

    if (type === 'refund.processed') {
      const refund = body.payload?.refund?.entity;
      const rzpPaymentId = refund?.payment_id ?? paymentEntity?.id;
      if (!rzpPaymentId) throw new Error('refund.processed without payment id');
      await this.recordRefund(String(rzpPaymentId), paymentEntity);
      return;
    }

    const orderId = paymentEntity?.order_id ?? orderEntity?.id;
    if (!orderId) throw new Error(`${type} without order id`);

    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId: String(orderId) },
    });
    // Orders created outside this app (dashboard, other integrations on the
    // same account) are not ours — note it on the row, don't fail loudly.
    if (!payment) throw new Error(`No payment for order ${orderId}`);

    if (type === 'payment.failed') {
      const reason =
        paymentEntity?.error_description ||
        paymentEntity?.error_reason ||
        paymentEntity?.error_code ||
        'Payment failed';
      await this.recordFailure(
        payment.razorpayOrderId,
        paymentEntity?.id ?? null,
        String(reason),
      );
      return;
    }

    // payment.captured / order.paid
    if (!paymentEntity?.id) throw new Error(`${type} without payment entity`);
    assertAmountMatches(
      payment,
      Number(paymentEntity.amount),
      String(paymentEntity.currency),
    );
    await this.fulfilPayment(payment.id, {
      razorpayPaymentId: String(paymentEntity.id),
    });
  }

  // -------------------------------------------------------------------------
  // Listing
  // -------------------------------------------------------------------------

  async listOrgPayments(organisationId: string, query: ListPaymentsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PaymentWhereInput = {
      organisationId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data: rows.map(toPublicPayment), total, page, limit };
  }

  async adminListPayments(query: AdminListPaymentsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PaymentWhereInput = {
      ...(query.organisationId ? { organisationId: query.organisationId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organisation: { select: { id: true, name: true, slug: true } },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      data: rows.map((p) => ({
        ...toPublicPayment(p),
        organisation: p.organisation,
        createdBy: p.createdBy,
      })),
      total,
      page,
      limit,
      mode: (await this.gateway.tryConfig())?.mode ?? null,
    };
  }

  /** All organisations (any status), name-sorted, for admin pickers. */
  async adminListOrganisations() {
    return this.prisma.organisation.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true },
    });
  }

  private async emit(name: PaymentEventName, p: Payment): Promise<void> {
    const event: PaymentEvent = {
      paymentId: p.id,
      organisationId: p.organisationId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      purpose: p.purpose,
      referenceType: p.referenceType,
      referenceId: p.referenceId,
      razorpayOrderId: p.razorpayOrderId,
      razorpayPaymentId: p.razorpayPaymentId,
    };
    await this.events.emit(name, event);
  }
}

function assertAmountMatches(
  payment: Payment,
  amount: number,
  currency: string,
): void {
  if (
    amount !== payment.amount ||
    currency.toUpperCase() !== payment.currency
  ) {
    throw new BadRequestException(
      `Amount mismatch for payment ${payment.id}: expected ${payment.amount} ${payment.currency}, got ${amount} ${currency}`,
    );
  }
}

function buildOrderNotes(
  paymentId: string,
  input: CreateOrderInput,
): Record<string, string> {
  const notes: Record<string, string> = {
    paymentId,
    organisationId: input.organisationId,
    purpose: input.purpose,
  };
  if (input.referenceType) notes.referenceType = input.referenceType;
  if (input.referenceId) notes.referenceId = input.referenceId;
  for (const [key, value] of Object.entries(input.notes ?? {})) {
    if (Object.keys(notes).length >= MAX_NOTE_KEYS) break;
    if (key in notes) continue;
    notes[key] = String(value).slice(0, MAX_NOTE_LENGTH);
  }
  return notes;
}

function describePurpose(purpose: PaymentPurpose): string {
  switch (purpose) {
    case 'test':
      return 'Test payment';
    default:
      return 'Payment';
  }
}

/** Payment as returned to clients — the Checkout signature stays server-side. */
export function toPublicPayment(p: Payment) {
  return {
    id: p.id,
    organisationId: p.organisationId,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    purpose: p.purpose,
    referenceType: p.referenceType,
    referenceId: p.referenceId,
    razorpayOrderId: p.razorpayOrderId,
    razorpayPaymentId: p.razorpayPaymentId,
    failureReason: p.failureReason,
    capturedAt: p.capturedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
