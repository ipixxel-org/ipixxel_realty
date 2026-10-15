import { createHmac, timingSafeEqual } from 'crypto';
import type { Invoice, Prisma } from '@prisma/client';
import { roundHalfUp } from './checkout-quote';

type Tx = Pick<
  Prisma.TransactionClient,
  'invoice' | 'invoiceCounter' | 'billingProfile' | 'plan'
>;

/**
 * Billing v2 step 7 — GST tax invoices and credit notes. Amounts are integer
 * paise (taken from the checkout, so they match what was charged); seller and
 * buyer are snapshots. Numbers run per Indian financial year (April–March):
 * INV/26-27/0001 for invoices, CN/26-27/0001 for credit notes.
 */

/** "26-27" for any date from 1 Apr 2026 to 31 Mar 2027 (UTC calendar date). */
export function financialYear(d: Date): string {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, '0');
  return `${two(start)}-${two(start + 1)}`;
}

/** Next number in a series; the counter row update is atomic per series. */
export async function nextInvoiceNumber(
  tx: Pick<Tx, 'invoiceCounter'>,
  prefix: 'INV' | 'CN',
  at: Date,
): Promise<string> {
  const series = `${prefix}/${financialYear(at)}`;
  const row = await tx.invoiceCounter.upsert({
    where: { series },
    create: { series, next: 2 },
    update: { next: { increment: 1 } },
  });
  return `${series}/${String(row.next - 1).padStart(4, '0')}`;
}

export interface InvoiceParty {
  legalName: string;
  gstin: string | null;
  state: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
}

/** The checkout fields an invoice needs (a BillingCheckout row fits). */
export interface InvoicedCheckout {
  id: string;
  organisationId: string;
  paymentId: string | null;
  toPlanId: string;
  toInterval: 'monthly' | 'yearly';
  kind: 'new' | 'upgrade_same_interval' | 'interval_change' | 'renewal';
  subtotalPaise: number;
  creditPaise: number;
  couponDiscountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  buyerLegalName: string;
  buyerGstin: string | null;
  buyerState: string;
  sellerSnapshot: unknown;
}

const monthLabel = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function checkoutDescription(
  planName: string,
  c: Pick<InvoicedCheckout, 'kind' | 'toInterval'>,
  at: Date,
): string {
  const base = `${planName} · ${c.toInterval}`;
  if (c.kind === 'upgrade_same_interval') return `${base} · upgrade (prorated)`;
  if (c.kind === 'interval_change')
    return `${base} · switch to yearly (less monthly credit)`;
  if (c.kind === 'renewal') return `${base} · renewal · ${monthLabel(at)}`;
  return `${base} · ${monthLabel(at)}`;
}

/** Buyer snapshot: the checkout's (name, GSTIN, state) plus the profile address. */
async function buyerFor(
  tx: Pick<Tx, 'billingProfile'>,
  orgId: string,
  fallback: { legalName: string; gstin: string | null; state: string | null },
): Promise<InvoiceParty> {
  const p = await tx.billingProfile.findUnique({
    where: { organisationId: orgId },
  });
  return {
    legalName: fallback.legalName || p?.legalName || '',
    gstin: fallback.gstin ?? p?.gstin ?? null,
    state: fallback.state ?? p?.state ?? null,
    addressLine1: p?.addressLine1 ?? null,
    addressLine2: p?.addressLine2 ?? null,
    city: p?.city ?? null,
    pincode: p?.pincode ?? null,
  };
}

/** Tax invoice for a paid checkout (once per checkout; ₹0 checkouts get none). */
export async function issueCheckoutInvoice(
  tx: Tx,
  c: InvoicedCheckout,
  at = new Date(),
): Promise<Invoice | null> {
  if (c.totalPaise <= 0) return null;
  const existing = await tx.invoice.findFirst({
    where: { checkoutId: c.id, kind: 'invoice' },
  });
  if (existing) return existing;
  const plan = await tx.plan.findUnique({ where: { id: c.toPlanId } });
  return tx.invoice.create({
    data: {
      number: await nextInvoiceNumber(tx, 'INV', at),
      kind: 'invoice',
      status: 'paid',
      organisationId: c.organisationId,
      checkoutId: c.id,
      paymentId: c.paymentId,
      issuedAt: at,
      description: checkoutDescription(plan?.name ?? 'Plan', c, at),
      seller: c.sellerSnapshot ?? {},
      buyer: (await buyerFor(tx, c.organisationId, {
        legalName: c.buyerLegalName,
        gstin: c.buyerGstin,
        state: c.buyerState || null,
      })) as unknown as Prisma.InputJsonValue,
      subtotalPaise: c.subtotalPaise,
      discountPaise: c.creditPaise + c.couponDiscountPaise,
      taxablePaise: c.taxablePaise,
      cgstPaise: c.cgstPaise,
      sgstPaise: c.sgstPaise,
      igstPaise: c.igstPaise,
      totalPaise: c.totalPaise,
    },
  });
}

/**
 * Tax invoice for a payment received offline: the amount is GST-inclusive,
 * so taxable = total ÷ 1.18 (rounded half up) and GST is the rest, split
 * CGST/SGST in the seller's state, else IGST.
 */
export async function issueOfflineInvoice(
  tx: Tx,
  input: {
    organisationId: string;
    offlinePaymentId: string;
    totalPaise: number;
    description: string;
    seller: InvoiceParty;
    at: Date;
  },
): Promise<Invoice> {
  const buyer = await buyerFor(tx, input.organisationId, {
    legalName: '',
    gstin: null,
    state: null,
  });
  const taxable = roundHalfUp(input.totalPaise * 100, 118);
  const gst = input.totalPaise - taxable;
  const intra = !!input.seller.state && input.seller.state === buyer.state;
  const cgst = intra ? Math.floor(gst / 2) : 0;
  return tx.invoice.create({
    data: {
      number: await nextInvoiceNumber(tx, 'INV', input.at),
      kind: 'invoice',
      status: 'paid',
      organisationId: input.organisationId,
      offlinePaymentId: input.offlinePaymentId,
      issuedAt: input.at,
      description: input.description,
      seller: input.seller as unknown as Prisma.InputJsonValue,
      buyer: buyer as unknown as Prisma.InputJsonValue,
      subtotalPaise: taxable,
      taxablePaise: taxable,
      cgstPaise: cgst,
      sgstPaise: intra ? gst - cgst : 0,
      igstPaise: intra ? 0 : gst,
      totalPaise: input.totalPaise,
    },
  });
}

/** Credit note cancelling an invoice in full; the invoice becomes `refunded`. */
export async function issueCreditNote(
  tx: Pick<Tx, 'invoice' | 'invoiceCounter'>,
  invoice: Invoice,
  at = new Date(),
): Promise<Invoice> {
  const existing = await tx.invoice.findFirst({
    where: { creditForId: invoice.id, kind: 'credit_note' },
  });
  if (existing) return existing;
  const note = await tx.invoice.create({
    data: {
      number: await nextInvoiceNumber(tx, 'CN', at),
      kind: 'credit_note',
      status: 'refunded',
      organisationId: invoice.organisationId,
      checkoutId: invoice.checkoutId,
      paymentId: invoice.paymentId,
      offlinePaymentId: invoice.offlinePaymentId,
      creditForId: invoice.id,
      issuedAt: at,
      description: `Credit note for ${invoice.number} — ${invoice.description}`,
      seller: invoice.seller as Prisma.InputJsonValue,
      buyer: invoice.buyer as Prisma.InputJsonValue,
      subtotalPaise: invoice.subtotalPaise,
      discountPaise: invoice.discountPaise,
      taxablePaise: invoice.taxablePaise,
      cgstPaise: invoice.cgstPaise,
      sgstPaise: invoice.sgstPaise,
      igstPaise: invoice.igstPaise,
      totalPaise: invoice.totalPaise,
    },
  });
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { status: 'refunded' },
  });
  return note;
}

/* --------------------------------------------- signed document links */

const DOC_TTL_MS = 60 * 60 * 1000;

function docSecret(): string {
  return `invoice-doc:${process.env.JWT_SECRET ?? 'dev'}`;
}

function sign(id: string, exp: number): string {
  return createHmac('sha256', docSecret()).update(`${id}.${exp}`).digest('hex');
}

/**
 * A link to the printable invoice that works without signing in for an
 * hour (so the browser can open it in a new tab), through the frontend's
 * /api proxy.
 */
export function invoiceDocumentUrl(id: string, now = Date.now()): string {
  const exp = now + DOC_TTL_MS;
  return `/api/billing/invoices/${encodeURIComponent(id)}/document?exp=${exp}&sig=${sign(id, exp)}`;
}

export function verifyInvoiceDocumentSig(
  id: string,
  exp: string | undefined,
  sig: string | undefined,
  now = Date.now(),
): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < now || !sig || !/^[0-9a-f]{64}$/.test(sig)) {
    return false;
  }
  const want = Buffer.from(sign(id, e), 'hex');
  const got = Buffer.from(sig, 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}
