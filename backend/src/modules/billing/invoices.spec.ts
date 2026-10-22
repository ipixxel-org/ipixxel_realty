/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- test-only in-memory Prisma fake: rows are untyped on purpose */
import { PaymentEventsService } from '../payments/payment-events';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingInvoiceMailer } from './billing-invoice-mailer.service';
import {
  BillingLedgerService,
  renderInvoiceHtml,
} from './billing-ledger.service';
import {
  financialYear,
  invoiceDocumentUrl,
  issueCreditNote,
  issueOfflineInvoice,
  nextInvoiceNumber,
  verifyInvoiceDocumentSig,
} from './invoice.util';
import {
  createFakeBillingDb,
  giveBillingDetails,
} from '../../../test/fakes/fake-billing-db';

const DAY = 86_400_000;
const BASIC = {
  id: 'basic',
  name: 'Basic',
  priceMonthly: 0,
  priceYearly: 0,
  isSystem: true,
  limits: { users: 2 },
};
const GROWTH = {
  id: 'growth',
  name: 'Growth',
  priceMonthly: 2000,
  priceYearly: 20000,
  limits: { users: 5 },
};
const SELLER = {
  legalName: 'iPixxel',
  gstin: '29AAICI1234A1Z9',
  state: '29',
  addressLine1: null,
  addressLine2: null,
  city: null,
  pincode: null,
};

describe('invoice numbers', () => {
  it('financial year runs April to March', () => {
    expect(financialYear(new Date('2026-04-01T00:00:00Z'))).toBe('26-27');
    expect(financialYear(new Date('2027-03-31T23:00:00Z'))).toBe('26-27');
    expect(financialYear(new Date('2026-03-31T10:00:00Z'))).toBe('25-26');
  });

  it('numbers each series in order, separately for invoices and credit notes', async () => {
    const { db } = createFakeBillingDb({ plans: [] });
    const at = new Date('2026-10-15T00:00:00Z');
    expect(await nextInvoiceNumber(db as never, 'INV', at)).toBe(
      'INV/26-27/0001',
    );
    expect(await nextInvoiceNumber(db as never, 'INV', at)).toBe(
      'INV/26-27/0002',
    );
    expect(await nextInvoiceNumber(db as never, 'CN', at)).toBe(
      'CN/26-27/0001',
    );
    expect(
      await nextInvoiceNumber(
        db as never,
        'INV',
        new Date('2027-04-02T00:00:00Z'),
      ),
    ).toBe('INV/27-28/0001');
  });

  it('document links are signed and expire', () => {
    const now = Date.now();
    const url = invoiceDocumentUrl('inv-1', now);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/api/billing/invoices/inv-1/document?')).toBe(true);
    expect(
      verifyInvoiceDocumentSig('inv-1', q.get('exp')!, q.get('sig')!, now),
    ).toBe(true);
    expect(
      verifyInvoiceDocumentSig('inv-2', q.get('exp')!, q.get('sig')!, now),
    ).toBe(false);
    expect(
      verifyInvoiceDocumentSig(
        'inv-1',
        q.get('exp')!,
        q.get('sig')!,
        now + 2 * 60 * 60 * 1000,
      ),
    ).toBe(false);
    expect(verifyInvoiceDocumentSig('inv-1', undefined, 'x', now)).toBe(false);
  });
});

function setup(sub: Record<string, unknown> = {}) {
  const { db } = createFakeBillingDb({
    plans: [BASIC, GROWTH],
    subscription: {
      id: 'sub-1',
      orgId: 'org-1',
      planId: 'growth',
      billingCycle: 'monthly',
      status: 'past_due',
      amount: 2000,
      renewsAt: new Date(Date.now() - 2 * DAY),
      graceEndsAt: new Date(Date.now() + 5 * DAY),
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      couponId: null,
      movedToBasicAt: null,
      ...sub,
    },
  });
  // Billing details are the org profile (Settings → General).
  giveBillingDetails(db, {
    name: 'Acme Pvt Ltd',
    city: 'Mysuru',
    postalCode: '570001',
    gstin: '29AABCA1234F1Z5',
  });
  db.organisation.findMany = async () => [{ id: 'org-1', name: 'Acme' }];
  const ledger = new BillingLedgerService(db as never);
  const payments = {
    refundInFull: jest.fn(async (id: string) => {
      const p = db.payment.rows.find((r: any) => r.id === id);
      p.status = 'refunded';
      return { refundId: 'rfnd_1', amount: p.amount };
    }),
  };
  const overview = {
    getOverview: jest.fn(async () => ({
      plan: { id: 'growth' },
      interval: 'monthly',
      status: 'active',
      usage: [],
      graceDays: 7,
      renewalAmount: 2360,
      periodEnd: null,
      movedToBasicAt: null,
      graceEndsAt: null,
      cancelAt: null,
    })),
  };
  // The invoice / credit note email: the real mailer, SMTP faked. `mailed()`
  // waits for the emails the service started without awaiting.
  const email = {
    sendMail: jest.fn<Promise<{ success: boolean }>, [Record<string, any>]>(
      async () => ({ success: true }),
    ),
  };
  const mailer = new BillingInvoiceMailer(db as never, email as never);
  const started: Promise<number>[] = [];
  const send = mailer.sendForInvoice.bind(mailer);
  mailer.sendForInvoice = (id: string) => {
    const p = send(id);
    started.push(p);
    return p;
  };
  const admin = new AdminSubscriptionsService(
    db as never,
    overview as never,
    ledger,
    { list: async () => [] } as never,
    { cancel: jest.fn() } as never,
    payments as never,
    { getSellerSettings: async () => SELLER } as never,
    mailer,
  );
  return {
    db,
    ledger,
    admin,
    payments,
    email,
    mailed: () => Promise.all(started),
    sub: () => db.subscription.rows[0],
  };
}

describe('invoices for plan payments', () => {
  it('a paid checkout gets a GST invoice with its amounts; ₹0 checkouts get none', async () => {
    const { db, ledger } = setup({
      status: 'active',
      planId: 'basic',
      renewsAt: new Date(Date.now() + 20 * DAY),
      graceEndsAt: null,
    });
    const checkouts = new BillingCheckoutService(
      db as never,
      { getMode: async () => ({ mode: 'online', reason: null }) } as never,
      { getSellerSettings: async () => SELLER } as never,
      {
        createOrder: async (i: any) => {
          const pay = await db.payment.create({
            data: {
              organisationId: 'org-1',
              amount: i.amountPaise,
              purpose: 'plan_purchase',
              status: 'created',
              referenceId: i.referenceId,
              razorpayOrderId: 'order_1',
            },
          });
          return {
            paymentId: pay.id,
            orderId: 'order_1',
            amount: i.amountPaise,
            keyId: 'k',
            name: 'n',
            prefill: {},
          };
        },
      } as never,
      new PaymentEventsService(),
      {} as never,
    );
    await checkouts.start('org-1', 'u1', {
      planId: 'growth',
      interval: 'monthly',
    });
    const c = db.billingCheckout.rows[0];
    await checkouts.fulfil(c.id, c.totalPaise);
    await checkouts.fulfil(c.id, c.totalPaise); // once only
    expect(db.invoice.rows).toHaveLength(1);
    expect(db.invoice.rows[0]).toMatchObject({
      number: expect.stringMatching(/^INV\/\d\d-\d\d\/0001$/),
      kind: 'invoice',
      status: 'paid',
      checkoutId: c.id,
      paymentId: c.paymentId,
      taxablePaise: 200000,
      cgstPaise: 18000,
      sgstPaise: 18000,
      totalPaise: 236000,
    });
    expect(db.invoice.rows[0].buyer).toMatchObject({
      legalName: 'Acme Pvt Ltd',
      gstin: '29AABCA1234F1Z5',
      city: 'Mysuru',
    });
    const list = await ledger.listInvoices('org-1');
    expect(list.data[0]).toMatchObject({
      subtotal: 2000,
      gst: 360,
      total: 2360,
      status: 'paid',
    });
    expect(list.data[0].pdfUrl).toMatch(/^\/api\/billing\/invoices\//);
    const html = renderInvoiceHtml(db.invoice.rows[0]);
    expect(html).toContain('Tax invoice');
    expect(html).toContain('CGST 9%');
    expect(html).toContain('Acme Pvt Ltd');
  });

  it('offline invoice: GST-inclusive amount split back out', async () => {
    const { db } = setup();
    const inv = await issueOfflineInvoice(db as never, {
      organisationId: 'org-1',
      offlinePaymentId: 'off-1',
      totalPaise: 236000,
      description: 'Growth',
      seller: SELLER,
      at: new Date(),
    });
    expect(inv).toMatchObject({
      taxablePaise: 200000,
      cgstPaise: 18000,
      sgstPaise: 18000,
      igstPaise: 0,
      totalPaise: 236000,
    });
    const odd = await issueOfflineInvoice(db as never, {
      organisationId: 'org-1',
      offlinePaymentId: 'off-2',
      totalPaise: 100001,
      description: 'x',
      seller: { ...SELLER, state: '27' },
      at: new Date(),
    });
    expect(odd.taxablePaise + odd.igstPaise).toBe(100001);
    expect(odd.cgstPaise).toBe(0);
  });

  it('credit note copies the invoice once and marks it refunded', async () => {
    const { db } = setup();
    const inv = await issueOfflineInvoice(db as never, {
      organisationId: 'org-1',
      offlinePaymentId: 'off-1',
      totalPaise: 236000,
      description: 'Growth',
      seller: SELLER,
      at: new Date(),
    });
    const cn = await issueCreditNote(db as never, inv);
    expect(await issueCreditNote(db as never, inv)).toMatchObject({
      id: cn.id,
    });
    expect(cn).toMatchObject({
      kind: 'credit_note',
      creditForId: inv.id,
      totalPaise: 236000,
      number: expect.stringMatching(/^CN\//),
    });
    expect(db.invoice.rows.find((r: any) => r.id === inv.id).status).toBe(
      'refunded',
    );
    expect(renderInvoiceHtml(cn)).toContain('Credit note');
  });
});

describe('Super Admin actions', () => {
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: any) => e.response?.code ?? String(e),
    );

  it('extend grace adds days to the grace end; only in grace', async () => {
    const { admin, sub } = setup();
    const before = sub().graceEndsAt.getTime();
    await admin.extendGrace('org-1', 'admin', 5, 'bank holiday');
    expect(sub().graceEndsAt.getTime() - before).toBe(5 * DAY);
    const active = setup({
      status: 'active',
      graceEndsAt: null,
      renewsAt: new Date(Date.now() + 9 * DAY),
    });
    expect(await code(active.admin.extendGrace('org-1', 'admin', 5))).toBe(
      'not_in_grace',
    );
  });

  it('mark paid offline: records the payment, invoices it, renews the plan, and shows in payment history', async () => {
    const { admin, db, ledger, sub } = setup();
    const renewsAt = sub().renewsAt;
    await admin.markPaidOffline('org-1', 'admin', {
      amount: 2360,
      method: 'Bank transfer',
      reference: 'UTR123',
      receivedOn: '2026-10-14',
    });
    expect(db.offlinePayment.rows[0]).toMatchObject({
      amountPaise: 236000,
      method: 'Bank transfer',
      reference: 'UTR123',
      status: 'received',
    });
    expect(db.invoice.rows[0]).toMatchObject({
      offlinePaymentId: db.offlinePayment.rows[0].id,
      totalPaise: 236000,
      taxablePaise: 200000,
    });
    expect(sub()).toMatchObject({
      status: 'active',
      graceEndsAt: null,
      planId: 'growth',
    });
    expect(sub().renewsAt).toEqual(new Date(renewsAt.getTime() + 30 * DAY));
    const history = await ledger.listPayments('org-1');
    expect(history.data[0]).toMatchObject({
      status: 'offline',
      amount: 2360,
      method: 'Offline · Bank transfer',
      reference: 'UTR123',
    });
    expect(history.data[0].receiptUrl).toMatch(/^\/api\/billing\/invoices\//);
    expect(
      db.auditLog.rows.some(
        (a: any) => a.action === 'offline_payment_recorded',
      ),
    ).toBe(true);
  });

  it('mark paid offline emails the invoice once; a refund emails the credit note', async () => {
    const { admin, db, email, mailed } = setup();
    await admin.markPaidOffline('org-1', 'admin', {
      amount: 2360,
      method: 'Bank transfer',
      reference: 'UTR123',
      receivedOn: '2026-10-14',
    });
    await mailed();
    const invoice = db.invoice.rows[0];
    expect(email.sendMail).toHaveBeenCalledTimes(1);
    expect(email.sendMail.mock.calls[0][0]).toMatchObject({
      to: 'asha@acme.test',
      subject: `Payment received – Invoice ${invoice.number}`,
    });
    expect(email.sendMail.mock.calls[0][0].html).toContain('Total paid');

    const off = db.offlinePayment.rows[0];
    await admin.refund(off.id, 'admin', 'paid twice');
    await mailed();
    const note = db.invoice.rows.find((i: any) => i.kind === 'credit_note');
    expect(email.sendMail).toHaveBeenCalledTimes(2);
    expect(email.sendMail.mock.calls[1][0]).toMatchObject({
      subject: `Refund processed – Credit note ${note.number}`,
    });
    expect(email.sendMail.mock.calls[1][0].html).toContain('Total refunded');
    expect(email.sendMail.mock.calls[1][0].attachments[0].filename).toMatch(
      /^Credit-note-CN-/,
    );
  });

  it('mark paid offline on Basic after a paid plan buys that plan back', async () => {
    const { admin, sub } = setup({
      planId: 'basic',
      status: 'active',
      renewsAt: null,
      graceEndsAt: null,
      movedToBasicAt: new Date(),
      previousPlanId: 'growth',
      previousInterval: 'monthly',
    });
    await admin.markPaidOffline('org-1', 'admin', {
      amount: 2360,
      method: 'Cheque',
      reference: '',
      receivedOn: '2026-10-14',
    });
    expect(sub()).toMatchObject({ planId: 'growth', movedToBasicAt: null });
  });

  it('apply coupon: checked like at checkout, attached for the next renewals', async () => {
    const { admin, db, sub } = setup();
    db.coupon.rows.push({
      id: 'c1',
      code: 'SAVE10',
      kind: 'percent',
      percentOff: 10,
      amountOffPaise: null,
      planIds: ['growth'],
      interval: 'any',
      duration: 'first_n',
      durationCount: 3,
      validFrom: new Date(Date.now() - DAY),
      validTo: null,
      totalUses: null,
      oncePerOrg: true,
      orgIds: [],
    });
    db.coupon.rows.push({
      id: 'c2',
      code: 'YEARLY',
      kind: 'percent',
      percentOff: 10,
      amountOffPaise: null,
      planIds: ['growth'],
      interval: 'yearly',
      duration: 'forever',
      durationCount: null,
      validFrom: new Date(Date.now() - DAY),
      validTo: null,
      totalUses: null,
      oncePerOrg: true,
      orgIds: [],
    });
    expect(await code(admin.applyCoupon('org-1', 'admin', 'yearly'))).toBe(
      'coupon_invalid',
    );
    await admin.applyCoupon('org-1', 'admin', 'save10');
    expect(sub()).toMatchObject({ couponId: 'c1', couponRenewalsLeft: 3 });
  });

  it('refund: online through Razorpay, offline by marking it; each gets a credit note', async () => {
    const { admin, db, payments } = setup();
    // An online payment with its invoice.
    db.payment.rows.push({
      id: 'pay-1',
      organisationId: 'org-1',
      amount: 236000,
      purpose: 'plan_purchase',
      status: 'captured',
      razorpayPaymentId: 'pay_X',
      razorpayOrderId: 'order_X',
      createdAt: new Date(),
      organisation: { name: 'Acme' },
    });
    db.invoice.rows.push({
      id: 'inv-1',
      number: 'INV/26-27/0009',
      kind: 'invoice',
      status: 'paid',
      organisationId: 'org-1',
      paymentId: 'pay-1',
      offlinePaymentId: null,
      checkoutId: null,
      creditForId: null,
      issuedAt: new Date(),
      description: 'Growth',
      seller: {},
      buyer: {},
      subtotalPaise: 200000,
      discountPaise: 0,
      taxablePaise: 200000,
      cgstPaise: 18000,
      sgstPaise: 18000,
      igstPaise: 0,
      totalPaise: 236000,
    });
    db.payment.findMany = async () =>
      db.payment.rows.map((p: any) => ({
        ...p,
        organisation: { name: 'Acme' },
        billingCheckout: null,
      }));
    const res = await admin.refund('pay-1', 'admin', 'duplicate payment');
    expect(payments.refundInFull).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ reason: 'duplicate payment' }),
    );
    expect(res.creditNoteNumber).toMatch(/^CN\//);
    expect(res.payment).toMatchObject({ id: 'pay-1', status: 'refunded' });
    expect(await code(admin.refund('pay-1', 'admin'))).toBe('not_refundable');

    await admin.markPaidOffline('org-1', 'admin', {
      amount: 2360,
      method: 'Cash',
      reference: '',
      receivedOn: '2026-10-14',
    });
    const off = db.offlinePayment.rows[0];
    const r2 = await admin.refund(off.id, 'admin');
    expect(r2.payment).toMatchObject({ status: 'refunded' });
    expect(
      db.invoice.rows.filter((i: any) => i.kind === 'credit_note'),
    ).toHaveLength(2);
  });
});
