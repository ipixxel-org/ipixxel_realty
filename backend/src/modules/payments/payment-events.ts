import { Injectable, Logger } from '@nestjs/common';
import type { PaymentPurpose, PaymentStatus } from '@prisma/client';

/**
 * In-process payment lifecycle events. Features that sell something (plan
 * purchase, renewals, add-ons …) subscribe here and act on their own
 * `referenceType`/`referenceId`; the payments module never knows about them.
 *
 *   constructor(events: PaymentEventsService) {
 *     events.on('payment.captured', (e) => e.purpose === 'plan_purchase' && …);
 *   }
 *
 * Each event is emitted once per state change, after the DB transaction that
 * made the change has committed. A handler that throws is logged and does not
 * undo the payment or block other handlers; a handler that must not lose work
 * should be idempotent and re-derivable from the Payment row.
 *
 * Deliberately a tiny registry rather than @nestjs/event-emitter: no new
 * dependency, and handlers are awaited so tests can observe them.
 */
export type PaymentEventName =
  'payment.captured' | 'payment.failed' | 'payment.refunded';

export interface PaymentEvent {
  paymentId: string;
  organisationId: string;
  amount: number; // paise
  currency: string;
  status: PaymentStatus;
  purpose: PaymentPurpose;
  referenceType: string | null;
  referenceId: string | null;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
}

export type PaymentEventHandler = (event: PaymentEvent) => void | Promise<void>;

@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name);
  private readonly handlers = new Map<
    PaymentEventName,
    PaymentEventHandler[]
  >();

  /** Register a handler; returns an unsubscribe function. */
  on(name: PaymentEventName, handler: PaymentEventHandler): () => void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
    return () => {
      const current = this.handlers.get(name) ?? [];
      this.handlers.set(
        name,
        current.filter((h) => h !== handler),
      );
    };
  }

  async emit(name: PaymentEventName, event: PaymentEvent): Promise<void> {
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error(
          `${name} handler failed for payment ${event.paymentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
