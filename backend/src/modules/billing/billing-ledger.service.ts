import { Injectable, NotFoundException } from '@nestjs/common';
import type { Invoice } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { toRupees } from './checkout-quote';
import { GST_STATES } from './gst';
import { invoiceDocumentUrl, type InvoiceParty } from './invoice.util';
import type { WhatStays } from '../../common/utils/retention.util';
import type { OrgPlanRequestV2 } from './billing.types';

/** The contract's Invoice. */
export interface InvoiceV2 {
  id: string;
  number: string;
  issuedAt: string;
  description: string;
  subtotal: number;
  gst: number;
  total: number;
  status: 'paid' | 'refunded' | 'void';
  pdfUrl: string | null;
  /** The checkout it was issued for (null: offline payment or credit note). */
  checkoutId: string | null;
}

/** An invoice or credit note: its number and the signed printable document. */
export interface InvoiceLinkV2 {
  id: string;
  number: string;
  url: string;
}

/** The contract's PaymentRecord (+ org for the admin list). */
export interface PaymentRecordV2 {
  id: string;
  createdAt: string;
  description: string;
  amount: number;
  method: string;
  status: 'captured' | 'failed' | 'refunded' | 'offline';
  failureReason: string | null;
  couponCode: string | null;
  reference: string;
  receiptUrl: string | null;
  /** Razorpay order id; null for an offline payment. */
  orderId: string | null;
  /** Razorpay payment id (pay_…); null until paid, and for offline payments. */
  gatewayPaymentId: string | null;
  /** The GST invoice for this payment — the document Billing → Invoices opens. */
  invoice: InvoiceLinkV2 | null;
  /** The credit note, once the payment is refunded. */
  creditNote: InvoiceLinkV2 | null;
  orgId: string;
  orgName: string;
}

const invoiceLink = (i: Invoice | undefined): InvoiceLinkV2 | null =>
  i ? { id: i.id, number: i.number, url: invoiceDocumentUrl(i.id) } : null;

/** Order id, payment id or offline reference contains `search` (case-insensitive). Pure. */
export function paymentMatchesSearch(
  r: Pick<PaymentRecordV2, 'orderId' | 'gatewayPaymentId' | 'reference'>,
  search: string | undefined,
): boolean {
  const q = search?.trim().toLowerCase();
  if (!q) return true;
  return [r.orderId, r.gatewayPaymentId, r.reference].some((v) =>
    v?.toLowerCase().includes(q),
  );
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

const page = <T>(rows: T[], p = 1, size = 10): Paged<T> => {
  const pageSize = Math.min(Math.max(1, size), 100);
  const pageNo = Math.max(1, p);
  return {
    data: rows.slice((pageNo - 1) * pageSize, pageNo * pageSize),
    total: rows.length,
    page: pageNo,
    pageSize,
  };
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function toInvoiceV2(i: Invoice): InvoiceV2 {
  return {
    id: i.id,
    number: i.number,
    issuedAt: isoDate(i.issuedAt),
    description: i.description,
    subtotal: toRupees(i.taxablePaise),
    gst: toRupees(i.cgstPaise + i.sgstPaise + i.igstPaise),
    total: toRupees(i.totalPaise),
    status: i.status,
    pdfUrl: invoiceDocumentUrl(i.id),
    checkoutId: i.kind === 'invoice' ? i.checkoutId : null,
  };
}

/**
 * Billing v2 step 7 — invoices and payment history: the organisation's own
 * lists, the Super Admin's list across organisations, and the printable
 * invoice document. Plan payments are Razorpay payments for billing
 * checkouts plus payments recorded offline by a Super Admin.
 */
@Injectable()
export class BillingLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async listInvoices(
    orgId: string,
    p?: number,
    size?: number,
  ): Promise<Paged<InvoiceV2>> {
    const rows = await this.prisma.invoice.findMany({
      where: { organisationId: orgId },
      orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }],
    });
    return page(rows.map(toInvoiceV2), p, size);
  }

  /** Plan change requests (manual mode) for one org, newest first. */
  async listRequests(
    orgId: string,
    p?: number,
    size?: number,
  ): Promise<Paged<OrgPlanRequestV2>> {
    const rows = await this.prisma.packageChangeRequest.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: {
        requestedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        currentPlan: { select: { id: true, name: true } },
        targetPlan: {
          select: {
            id: true,
            name: true,
            priceMonthly: true,
            priceYearly: true,
          },
        },
        billingCheckout: { select: { kind: true, taxablePaise: true } },
      },
    });
    return page(
      rows.map((r): OrgPlanRequestV2 => {
        const c = r.billingCheckout;
        const by = r.requestedBy;
        return {
          id: r.id,
          requestedAt: r.createdAt.toISOString(),
          requestedBy: by
            ? [by.firstName, by.lastName].filter(Boolean).join(' ') || by.email
            : null,
          fromPlan: r.currentPlan ?? null,
          toPlan: { id: r.targetPlan.id, name: r.targetPlan.name },
          interval: r.billingCycle,
          amount: c
            ? toRupees(c.taxablePaise)
            : r.billingCycle === 'yearly'
              ? r.targetPlan.priceYearly
              : r.targetPlan.priceMonthly,
          amountNote:
            c?.kind === 'upgrade_same_interval'
              ? 'prorated'
              : c?.kind === 'interval_change'
                ? 'less_monthly_credit'
                : null,
          status: r.status === 'cancelled' ? 'withdrawn' : r.status,
          // Withdrawn requests have no reviewer: their decision date is the update.
          decidedAt:
            r.status === 'pending'
              ? null
              : (r.reviewedAt ?? r.updatedAt).toISOString(),
          rejectionReason: r.status === 'rejected' ? r.rejectionReason : null,
          whatStays: (r.whatStays as WhatStays | null) ?? null,
        };
      }),
      p,
      size,
    );
  }

  /** Plan payments for one org (or all orgs), newest first. */
  async payments(orgId?: string): Promise<PaymentRecordV2[]> {
    const [online, offline] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          purpose: 'plan_purchase',
          status: { in: ['captured', 'failed', 'refunded'] },
          ...(orgId ? { organisationId: orgId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        include: {
          organisation: { select: { name: true } },
          billingCheckout: {
            select: {
              kind: true,
              toInterval: true,
              toPlan: { select: { name: true } },
              coupon: { select: { code: true } },
            },
          },
        },
      }),
      this.prisma.offlinePayment.findMany({
        where: orgId ? { organisationId: orgId } : {},
        orderBy: { receivedOn: 'desc' },
        take: 1000,
      }),
    ]);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        kind: 'invoice',
        OR: [
          { paymentId: { in: online.map((x) => x.id) } },
          { offlinePaymentId: { in: offline.map((x) => x.id) } },
        ],
      },
    });
    const byPayment = new Map(
      invoices.filter((i) => i.paymentId).map((i) => [i.paymentId!, i]),
    );
    const byOffline = new Map(
      invoices
        .filter((i) => i.offlinePaymentId)
        .map((i) => [i.offlinePaymentId!, i]),
    );
    // Credit notes point at the invoice they cancel.
    const creditNotes = invoices.length
      ? await this.prisma.invoice.findMany({
          where: {
            kind: 'credit_note',
            creditForId: { in: invoices.map((i) => i.id) },
          },
        })
      : [];
    const creditFor = new Map(creditNotes.map((n) => [n.creditForId!, n]));
    const orgNames = new Map(
      (
        await this.prisma.organisation.findMany({
          where: {
            id: { in: [...new Set(offline.map((o) => o.organisationId))] },
          },
          select: { id: true, name: true },
        })
      ).map((o) => [o.id, o.name]),
    );

    const kindLabel = {
      new: '',
      upgrade_same_interval: ' upgrade',
      interval_change: ' (switch to yearly)',
      renewal: ' renewal',
    } as const;
    const rows: PaymentRecordV2[] = [
      ...online.map((x) => {
        const c = x.billingCheckout;
        const inv = byPayment.get(x.id);
        return {
          id: x.id,
          createdAt: (x.capturedAt ?? x.createdAt).toISOString(),
          description: c
            ? `${c.toPlan.name} · ${c.toInterval}${kindLabel[c.kind]}`
            : 'Plan payment',
          amount: toRupees(x.amount),
          method: 'Online · Razorpay',
          status: x.status as 'captured' | 'failed' | 'refunded',
          failureReason: x.failureReason,
          couponCode: c?.coupon?.code ?? null,
          reference: x.razorpayPaymentId ?? x.razorpayOrderId,
          receiptUrl: inv ? invoiceDocumentUrl(inv.id) : null,
          orderId: x.razorpayOrderId,
          gatewayPaymentId: x.razorpayPaymentId,
          invoice: invoiceLink(inv),
          creditNote: invoiceLink(inv && creditFor.get(inv.id)),
          orgId: x.organisationId,
          orgName: x.organisation.name,
        };
      }),
      ...offline.map((o): PaymentRecordV2 => {
        const inv = byOffline.get(o.id);
        return {
          id: o.id,
          createdAt: o.receivedOn.toISOString(),
          description: inv?.description ?? 'Plan payment (paid offline)',
          amount: toRupees(o.amountPaise),
          method: `Offline · ${o.method}`,
          status: o.status === 'refunded' ? 'refunded' : 'offline',
          failureReason: null,
          couponCode: null,
          reference: o.reference || '—',
          receiptUrl: inv ? invoiceDocumentUrl(inv.id) : null,
          orderId: null,
          gatewayPaymentId: null,
          invoice: invoiceLink(inv),
          creditNote: invoiceLink(inv && creditFor.get(inv.id)),
          orgId: o.organisationId,
          orgName: orgNames.get(o.organisationId) ?? '',
        };
      }),
    ];
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listPayments(orgId: string, p?: number, size?: number) {
    return page(await this.payments(orgId), p, size);
  }

  async adminListPayments(q: {
    status?: string;
    orgId?: string;
    /** Razorpay order id / payment id, or an offline reference. */
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const all = await this.payments();
    const rows = all.filter(
      (r) =>
        (!q.status || r.status === q.status) &&
        (!q.orgId || r.orgId === q.orgId) &&
        paymentMatchesSearch(r, q.search),
    );
    const sum = (f: (r: PaymentRecordV2) => boolean) =>
      Math.round(all.filter(f).reduce((t, r) => t + r.amount * 100, 0)) / 100;
    return {
      ...page(rows, q.page, q.pageSize),
      totals: {
        collected: sum(
          (r) => r.status === 'captured' || r.status === 'offline',
        ),
        refunded: sum((r) => r.status === 'refunded'),
        failed: all.filter((r) => r.status === 'failed').length,
      },
    };
  }

  /* ------------------------------------------------------ document */

  async invoiceDocument(id: string): Promise<string> {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    return renderInvoiceHtml(inv);
  }
}

const esc = (s: unknown) =>
  (typeof s === 'string' || typeof s === 'number' ? String(s) : '').replace(
    /[&<>"']/g,
    (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        ch
      ]!,
  );
const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / 100);

function party(p: InvoiceParty | null | undefined): string {
  if (!p) return '';
  const state = p.state ? `${GST_STATES[p.state] ?? ''} (${p.state})` : '';
  const lines = [
    `<b>${esc(p.legalName)}</b>`,
    esc(p.addressLine1),
    esc(p.addressLine2),
    [esc(p.city), esc(p.pincode)].filter(Boolean).join(' '),
    esc(state),
    p.gstin ? `GSTIN ${esc(p.gstin)}` : '',
  ].filter(Boolean);
  return lines.join('<br>');
}

/** A self-contained, print-ready GST invoice / credit note. */
export function renderInvoiceHtml(inv: Invoice): string {
  const seller = inv.seller as unknown as InvoiceParty;
  const buyer = inv.buyer as unknown as InvoiceParty;
  const credit = inv.kind === 'credit_note';
  const title = credit ? 'Credit note' : 'Tax invoice';
  const row = (label: string, paise: number, strong = false) =>
    `<tr${strong ? ' class="total"' : ''}><td>${esc(label)}</td><td class="num">${inr(paise)}</td></tr>`;
  const taxRows =
    inv.igstPaise > 0
      ? row('IGST 18%', inv.igstPaise)
      : row('CGST 9%', inv.cgstPaise) + row('SGST 9%', inv.sgstPaise);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} ${esc(inv.number)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0;background:#f1f5f9}
  .sheet{max-width:760px;margin:24px auto;background:#fff;padding:36px 40px;border:1px solid #e2e8f0;border-radius:12px}
  h1{font-size:22px;margin:0 0 4px} .muted{color:#64748b;font-size:13px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0;font-size:13px;line-height:1.55}
  table{width:100%;border-collapse:collapse;font-size:14px} td{padding:8px 0;border-bottom:1px solid #f1f5f9}
  .num{text-align:right} tr.total td{font-weight:700;border-top:2px solid #0f172a;border-bottom:0}
  .bar{max-width:760px;margin:16px auto 0;text-align:right} button{padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}
  @media print{body{background:#fff}.sheet{border:0;margin:0;max-width:none}.bar{display:none}}
</style></head>
<body>
<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="sheet">
  <h1>${esc(title)}</h1>
  <div class="muted">No. <b>${esc(inv.number)}</b> · Date ${esc(isoDate(inv.issuedAt))}</div>
  <div class="grid">
    <div><div class="muted">From</div>${party(seller)}</div>
    <div><div class="muted">Billed to</div>${party(buyer)}</div>
  </div>
  <table>
    <tr><td>${esc(inv.description)}</td><td class="num">${inr(inv.subtotalPaise)}</td></tr>
    ${inv.discountPaise > 0 ? row('Credit and discounts', -inv.discountPaise) : ''}
    ${row('Taxable value', inv.taxablePaise)}
    ${taxRows}
    ${row(credit ? 'Total credited' : 'Total', inv.totalPaise, true)}
  </table>
  <p class="muted" style="margin-top:24px">Software subscription. ${credit ? 'This credit note cancels the invoice above in full.' : 'Paid in full.'}</p>
</div>
</body></html>`;
}
