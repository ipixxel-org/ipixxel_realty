/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import {
  BillingLedgerService,
  paymentMatchesSearch,
} from './billing-ledger.service';
import { invoiceDocumentUrl } from './invoice.util';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

/**
 * Super Admin payment rows (org detail → Payments, Payments & Invoicing): the
 * Razorpay order / payment ids, the invoice and credit note links (the same
 * signed document as the org's Billing → Invoices), and search by id.
 */
const invoice = (o: Record<string, unknown>) => ({
  kind: 'invoice',
  status: 'paid',
  organisationId: 'org-1',
  paymentId: null,
  offlinePaymentId: null,
  checkoutId: null,
  creditForId: null,
  issuedAt: new Date('2026-10-14'),
  description: 'Growth · monthly',
  seller: {},
  buyer: {},
  subtotalPaise: 200000,
  discountPaise: 0,
  taxablePaise: 200000,
  cgstPaise: 18000,
  sgstPaise: 18000,
  igstPaise: 0,
  totalPaise: 236000,
  ...o,
});

function setup() {
  const { db } = createFakeBillingDb({ plans: [] });
  db.organisation = {
    findMany: async () => [{ id: 'org-1', name: 'Acme' }],
  };
  // Online: one paid, one refunded (with its credit note), one failed.
  db.payment.rows.push(
    {
      id: 'p-paid',
      organisationId: 'org-1',
      amount: 236000,
      purpose: 'plan_purchase',
      status: 'captured',
      razorpayOrderId: 'order_PAID123',
      razorpayPaymentId: 'pay_PAID456',
      capturedAt: new Date('2026-10-12'),
      createdAt: new Date('2026-10-12'),
    },
    {
      id: 'p-refunded',
      organisationId: 'org-1',
      amount: 236000,
      purpose: 'plan_purchase',
      status: 'refunded',
      razorpayOrderId: 'order_REF789',
      razorpayPaymentId: 'pay_REF000',
      capturedAt: new Date('2026-10-10'),
      createdAt: new Date('2026-10-10'),
    },
    {
      id: 'p-failed',
      organisationId: 'org-1',
      amount: 236000,
      purpose: 'plan_purchase',
      status: 'failed',
      razorpayOrderId: 'order_FAIL1',
      razorpayPaymentId: null,
      failureReason: 'Card declined',
      capturedAt: null,
      createdAt: new Date('2026-10-09'),
    },
  );
  db.payment.findMany = async () =>
    db.payment.rows.map((p: any) => ({
      ...p,
      organisation: { name: 'Acme' },
      billingCheckout: null,
    }));
  db.offlinePayment.rows.push({
    id: 'off-1',
    organisationId: 'org-1',
    amountPaise: 236000,
    method: 'Bank transfer',
    reference: 'UTR998877',
    status: 'received',
    receivedOn: new Date('2026-10-14'),
  });
  db.invoice.rows.push(
    invoice({ id: 'inv-paid', number: 'INV/26-27/0001', paymentId: 'p-paid' }),
    invoice({
      id: 'inv-ref',
      number: 'INV/26-27/0002',
      paymentId: 'p-refunded',
      status: 'refunded',
    }),
    invoice({
      id: 'cn-ref',
      number: 'CN/26-27/0001',
      kind: 'credit_note',
      creditForId: 'inv-ref',
    }),
    invoice({
      id: 'inv-off',
      number: 'INV/26-27/0003',
      offlinePaymentId: 'off-1',
    }),
  );
  return { db, ledger: new BillingLedgerService(db as never) };
}

describe('payment rows', () => {
  it('online payments carry the Razorpay order and payment ids; offline ones carry none', async () => {
    const rows = await setup().ledger.payments('org-1');
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('p-paid')).toMatchObject({
      orderId: 'order_PAID123',
      gatewayPaymentId: 'pay_PAID456',
    });
    expect(byId.get('p-failed')).toMatchObject({
      orderId: 'order_FAIL1',
      gatewayPaymentId: null,
    });
    expect(byId.get('off-1')).toMatchObject({
      orderId: null,
      gatewayPaymentId: null,
      method: 'Offline · Bank transfer',
      reference: 'UTR998877',
    });
  });

  it('links each payment to its own invoice — the document Billing → Invoices opens — and refunds to the credit note', async () => {
    const { ledger } = setup();
    const rows = await ledger.payments('org-1');
    const byId = new Map(rows.map((r) => [r.id, r]));
    const docPath = (id: string) => invoiceDocumentUrl(id).split('?')[0];

    const paid = byId.get('p-paid')!;
    expect(paid.invoice).toMatchObject({
      id: 'inv-paid',
      number: 'INV/26-27/0001',
    });
    expect(paid.invoice!.url.split('?')[0]).toBe(docPath('inv-paid'));
    expect(paid.creditNote).toBeNull();

    const refunded = byId.get('p-refunded')!;
    expect(refunded.invoice).toMatchObject({ id: 'inv-ref' });
    expect(refunded.creditNote).toMatchObject({
      id: 'cn-ref',
      number: 'CN/26-27/0001',
    });
    expect(refunded.creditNote!.url.split('?')[0]).toBe(docPath('cn-ref'));

    expect(byId.get('off-1')!.invoice).toMatchObject({ id: 'inv-off' });
    expect(byId.get('p-failed')!.invoice).toBeNull();

    // The org's own Invoices list points at the very same documents.
    const orgList = await ledger.listInvoices('org-1');
    const orgUrl = orgList.data.find((i) => i.id === 'inv-paid')!.pdfUrl!;
    expect(orgUrl.split('?')[0]).toBe(paid.invoice!.url.split('?')[0]);
  });

  it('the Super Admin list searches by order id, payment id or offline reference', async () => {
    const { ledger } = setup();
    const ids = async (search: string) =>
      (await ledger.adminListPayments({ search })).data.map((r) => r.id);
    expect(await ids('order_paid')).toEqual(['p-paid']);
    expect(await ids('PAY_REF000')).toEqual(['p-refunded']);
    expect(await ids('UTR998')).toEqual(['off-1']);
    expect(await ids('nothing-like-this')).toEqual([]);
    expect(await ids('  ')).toHaveLength(4);
  });

  it('paymentMatchesSearch ignores case and blank input', () => {
    const r = { orderId: 'order_AbC', gatewayPaymentId: null, reference: '—' };
    expect(paymentMatchesSearch(r, 'abc')).toBe(true);
    expect(paymentMatchesSearch(r, undefined)).toBe(true);
    expect(paymentMatchesSearch(r, 'pay_')).toBe(false);
  });
});
