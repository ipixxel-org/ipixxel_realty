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
   * 30 minutes); superseded (a newer checkout or a scheduled change closed
   * it); needs_review (paid but not applied — a Super Admin is looking at
   * it); refunded; resolved (a Super Admin closed the review by hand).
   */
  state:
    | 'waiting'
    | 'paid'
    | 'failed'
    | 'expired'
    | 'superseded'
    | 'needs_review'
    | 'refunded'
    | 'resolved';
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
  payment: {
    select: { razorpayOrderId: true, capturedAt: true, status: true },
  },
} as const;

type OnlineCheckout = {
  id: string;
  status: string;
  fulfilledAt: Date | null;
  reviewReason?: string | null;
  payment?: {
    razorpayOrderId: string;
    capturedAt: Date | null;
    status?: string;
  } | null;
};

export function onlinePaymentView(
  row: { kind: string; status: string },
  c: OnlineCheckout | null | undefined,
  invoice: Invoice | undefined,
  withReason = false,
): OnlinePaymentViewV2 | null {
  if (row.kind !== 'online_payment') return null;
  const state: OnlinePaymentViewV2['state'] =
    c?.payment?.status === 'refunded'
      ? 'refunded'
      : c?.status === 'rejected'
        ? 'resolved'
        : row.status === 'approved'
          ? 'paid'
          : row.status === 'needs_review'
            ? 'needs_review'
            : row.status === 'awaiting_payment'
              ? 'waiting'
              : c?.status === 'failed'
                ? 'failed'
                : c?.status === 'expired'
                  ? 'expired'
                  : 'superseded';
  const paidAt =
    state === 'paid' ||
    state === 'needs_review' ||
    state === 'refunded' ||
    state === 'resolved'
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

/**
 * One change at a time: close the org's open online checkouts (a newer
 * checkout, or a downgrade / move to Basic was scheduled). Their rows show
 * "Superseded"; a payment that still arrives for one goes to needs_review
 * and is never applied (BillingCheckoutService.applyPaid).
 */
export async function supersedeOpenCheckouts(
  db: Pick<PrismaClient, 'billingCheckout' | 'packageChangeRequest'>,
  orgId: string,
): Promise<number> {
  const open = await db.billingCheckout.findMany({
    where: { organisationId: orgId, status: 'pending', mode: 'online' },
    select: { id: true, packageChangeRequestId: true },
  });
  if (!open.length) return 0;
  await db.billingCheckout.updateMany({
    where: { id: { in: open.map((o) => o.id) }, status: 'pending' },
    data: { status: 'cancelled' },
  });
  await setOnlineRows(
    db,
    open.map((o) => o.packageChangeRequestId),
    'cancelled',
  );
  return open.length;
}

/** The one "a payment is being checked" message (API and UI say the same). */
export const PAYMENT_REVIEW_MESSAGE =
  "A payment is being checked by our team. You can change plans once it's resolved.";

/** Whether a paid checkout for this org is waiting for a Super Admin (needs_review). */
export async function paymentUnderReview(
  db: Pick<PrismaClient, 'billingCheckout'>,
  orgId: string,
): Promise<boolean> {
  return !!(await db.billingCheckout.findFirst({
    where: { organisationId: orgId, status: 'needs_review' },
    select: { id: true },
  }));
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
