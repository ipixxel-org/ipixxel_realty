/**
 * Online step 3: every online payment is a row in package_change_requests
 * (kind 'online_payment', linked through billing_checkouts.
 * package_change_request_id). The row follows its checkout:
 *   checkout pending                     → awaiting_payment
 *   paid (plan applied)                  → approved (+ the applied what-stays copy)
 *   failed / expired / cancelled (newer) → cancelled (the label comes from the checkout)
 *   needs_review                         → needs_review
 * It never uses 'pending', so "one pending request" stays manual-mode only.
 * Plain functions over Prisma so the sweeper can call them too.
 */
import type { Invoice, Prisma, PrismaClient } from '@prisma/client';
import { invoiceDocumentUrl } from './invoice.util';

type RowsDb = Pick<PrismaClient, 'packageChangeRequest'>;

export type OnlineRowStatus =
  'awaiting_payment' | 'approved' | 'cancelled' | 'needs_review';

/** Move these online rows to `status` (ids of rows that aren't online are ignored). */
export async function setOnlineRows(
  db: RowsDb,
  requestIds: (string | null | undefined)[],
  status: OnlineRowStatus,
  extra: Prisma.PackageChangeRequestUpdateManyMutationInput = {},
  now = new Date(),
): Promise<void> {
  const ids = [...new Set(requestIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await db.packageChangeRequest.updateMany({
    where: { id: { in: ids }, kind: 'online_payment' },
    data: {
      status,
      reviewedAt: status === 'awaiting_payment' ? null : now,
      ...extra,
    },
  });
}

/** What the row shows about its payment (org Requests tab and Super Admin rows). */
export interface OnlinePaymentViewV2 {
  /**
   * waiting: the Razorpay order is open; paid; failed; expired (not paid in
   * 30 minutes); replaced (a newer checkout was started); needs_review (paid
   * but not applied — a Super Admin is looking at it).
   */
  state:
    'waiting' | 'paid' | 'failed' | 'expired' | 'replaced' | 'needs_review';
  /** When the payment was captured (paid / needs_review). */
  paidAt: string | null;
  /** Razorpay order id (order_…). */
  orderId: string | null;
  /** The GST invoice once paid (signed printable document). */
  invoice: { id: string; number: string; url: string } | null;
  /** Why it needs review (Super Admin only; the org list leaves it out). */
  reviewReason?: string | null;
}

/** The checkout fields onlinePaymentView reads (with the checkout id). */
export const ONLINE_CHECKOUT_SELECT = {
  status: true,
  fulfilledAt: true,
  reviewReason: true,
  payment: { select: { razorpayOrderId: true, capturedAt: true } },
} as const;

type OnlineCheckout = {
  id: string;
  status: string;
  fulfilledAt: Date | null;
  reviewReason?: string | null;
  payment?: { razorpayOrderId: string; capturedAt: Date | null } | null;
};

export function onlinePaymentView(
  row: { kind: string; status: string },
  c: OnlineCheckout | null | undefined,
  invoice: Invoice | undefined,
  withReason = false,
): OnlinePaymentViewV2 | null {
  if (row.kind !== 'online_payment') return null;
  const state: OnlinePaymentViewV2['state'] =
    row.status === 'approved'
      ? 'paid'
      : row.status === 'needs_review'
        ? 'needs_review'
        : row.status === 'awaiting_payment'
          ? 'waiting'
          : c?.status === 'failed'
            ? 'failed'
            : c?.status === 'expired'
              ? 'expired'
              : 'replaced';
  const paidAt =
    state === 'paid' || state === 'needs_review'
      ? (c?.payment?.capturedAt ?? c?.fulfilledAt ?? null)
      : null;
  return {
    state,
    paidAt: paidAt ? paidAt.toISOString() : null,
    orderId: c?.payment?.razorpayOrderId ?? null,
    invoice: invoice
      ? {
          id: invoice.id,
          number: invoice.number,
          url: invoiceDocumentUrl(invoice.id),
        }
      : null,
    ...(withReason ? { reviewReason: c?.reviewReason ?? null } : {}),
  };
}

/**
 * Online checkouts left unpaid past expiresAt become `expired` (and their
 * rows "Expired (not paid)"). Called lazily (overview, start checkout, the
 * request lists) and by the hourly lifecycle sweep. A payment that still
 * arrives later is handled: fulfilment accepts an expired checkout as long as
 * the quote still matches the org's plan.
 */
export async function expireStaleCheckouts(
  db: Pick<PrismaClient, 'billingCheckout' | 'packageChangeRequest'>,
  orgId?: string,
  now = new Date(),
): Promise<number> {
  const stale = await db.billingCheckout.findMany({
    where: {
      ...(orgId ? { organisationId: orgId } : {}),
      status: 'pending',
      mode: 'online',
      expiresAt: { lt: now },
    },
    select: { id: true, packageChangeRequestId: true },
  });
  if (!stale.length) return 0;
  const { count } = await db.billingCheckout.updateMany({
    where: { id: { in: stale.map((s) => s.id) }, status: 'pending' },
    data: { status: 'expired' },
  });
  await setOnlineRows(
    db,
    stale.map((s) => s.packageChangeRequestId),
    'cancelled',
    {},
    now,
  );
  return count;
}

/** The tax invoice issued for each of these checkouts (by checkout id). */
export async function invoicesByCheckout(
  db: Pick<PrismaClient, 'invoice'>,
  checkoutIds: (string | null | undefined)[],
): Promise<Map<string, Invoice>> {
  const ids = [...new Set(checkoutIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const invoices = await db.invoice.findMany({
    where: { checkoutId: { in: ids }, kind: 'invoice' },
  });
  return new Map(invoices.map((i) => [i.checkoutId as string, i]));
}
