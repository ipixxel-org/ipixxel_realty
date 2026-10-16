import { Injectable, Logger } from '@nestjs/common';
import type { Invoice } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { frontendBaseUrl } from '../../common/utils/app-url.util';
import { EmailService } from '../email/email.service';
import { getPaymentReceivedEmailHtml } from '../email/email.templates';
import { renderInvoiceHtml } from './billing-ledger.service';

const DAY_MS = 86_400_000;
const CYCLE_DAYS = { monthly: 30, yearly: 365 } as const;

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / 100);

const day = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** "Invoice-INV-26-27-0001.html" */
const fileName = (inv: Pick<Invoice, 'kind' | 'number'>) =>
  `${inv.kind === 'credit_note' ? 'Credit-note' : 'Invoice'}-${inv.number.replace(/[^A-Za-z0-9-]+/g, '-')}.html`;

/** The amounts in the email, from the invoice (integer paise). */
export function invoiceEmailRows(
  inv: Pick<
    Invoice,
    | 'subtotalPaise'
    | 'discountPaise'
    | 'cgstPaise'
    | 'sgstPaise'
    | 'igstPaise'
    | 'totalPaise'
    | 'kind'
  >,
): { label: string; value: string; strong?: boolean }[] {
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Package amount', value: inr(inv.subtotalPaise) },
  ];
  if (inv.discountPaise > 0) {
    rows.push({ label: 'Discount', value: `−${inr(inv.discountPaise)}` });
  }
  if (inv.igstPaise > 0) {
    rows.push({ label: 'IGST 18%', value: inr(inv.igstPaise) });
  } else {
    rows.push({
      label: 'GST 18% (CGST 9% + SGST 9%)',
      value: inr(inv.cgstPaise + inv.sgstPaise),
    });
  }
  rows.push({
    label: inv.kind === 'credit_note' ? 'Total refunded' : 'Total paid',
    value: inr(inv.totalPaise),
    strong: true,
  });
  return rows;
}

/**
 * Billing v2: emails the GST invoice to the org's owner and admins whenever a
 * payment is fulfilled (Razorpay or "Mark paid offline"), and the credit note
 * on a refund. Sent once per invoice: `invoices.emailed_at` is claimed before
 * sending, so the verify call and the webhook (or a retry) can't send it
 * twice. Uses the platform's SMTP and is recorded in the email logs under the
 * org. The invoice goes as an attachment — the same printable page as
 * Billing → Invoices (there's no PDF renderer yet) — plus a link to the app.
 * Never throws: a mail problem must not undo a payment.
 */
@Injectable()
export class BillingInvoiceMailer {
  private readonly logger = new Logger(BillingInvoiceMailer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** The invoice for a paid checkout, if it has one (a ₹0 checkout has none). */
  async sendForCheckout(checkoutId: string): Promise<number> {
    try {
      const inv = await this.prisma.invoice.findFirst({
        where: { checkoutId, kind: 'invoice' },
        select: { id: true },
      });
      return inv ? await this.sendForInvoice(inv.id) : 0;
    } catch (err) {
      this.logger.warn(
        `Invoice email for checkout ${checkoutId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  /** Returns how many emails were sent (0 when it was already emailed). */
  async sendForInvoice(invoiceId: string, now = new Date()): Promise<number> {
    try {
      const claim = await this.prisma.invoice.updateMany({
        where: { id: invoiceId, emailedAt: null },
        data: { emailedAt: now },
      });
      if (claim.count === 0) return 0;
      const inv = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
      });
      if (!inv) return 0;

      const orgId = inv.organisationId;
      const [org, recipients, sub, checkout] = await Promise.all([
        this.prisma.organisation.findUnique({
          where: { id: orgId },
          select: { name: true },
        }),
        this.recipients(orgId),
        this.prisma.subscription.findFirst({
          where: { orgId, status: { not: 'cancelled' } },
          include: { plan: { select: { name: true } } },
        }),
        inv.checkoutId
          ? this.prisma.billingCheckout.findUnique({
              where: { id: inv.checkoutId },
              include: { toPlan: { select: { name: true } } },
            })
          : Promise.resolve(null),
      ]);
      if (recipients.length === 0) return 0;

      const credit = inv.kind === 'credit_note';
      const interval = checkout?.toInterval ?? sub?.billingCycle ?? 'monthly';
      const planName = checkout?.toPlan.name ?? sub?.plan.name ?? '';
      const planLine = credit
        ? inv.description
        : `${planName || 'Plan'} · ${interval === 'yearly' ? 'Yearly' : 'Monthly'}`;
      // The term this payment covers, as applied to the subscription.
      let periodLine: string | null = null;
      const end = sub?.renewsAt ?? null;
      if (!credit && end) {
        const start =
          checkout?.kind === 'upgrade_same_interval'
            ? inv.issuedAt
            : new Date(end.getTime() - CYCLE_DAYS[interval] * DAY_MS);
        periodLine = `Period: ${day(start)} – ${day(end)}`;
      }

      const subject = credit
        ? `Refund processed – Credit note ${inv.number}`
        : `Payment received – Invoice ${inv.number}`;
      const attachment = {
        filename: fileName(inv),
        content: renderInvoiceHtml(inv),
        contentType: 'text/html; charset=utf-8',
      };
      let sent = 0;
      for (const r of recipients) {
        const res = await this.email.sendMail({
          to: r.email,
          subject,
          html: getPaymentReceivedEmailHtml({
            kind: credit ? 'credit_note' : 'invoice',
            recipientName: r.name,
            orgName: org?.name ?? '',
            number: inv.number,
            planLine,
            periodLine,
            rows: invoiceEmailRows(inv),
            invoicesUrl: `${frontendBaseUrl()}/org/settings/billing/invoices`,
          }),
          template: 'billing',
          orgId,
          smtpOrgId: null,
          attachments: [attachment],
          metadata: {
            kind: credit ? 'credit_note_email' : 'invoice_email',
            invoiceId: inv.id,
            invoiceNumber: inv.number,
          },
        });
        if (res.success) sent++;
      }
      return sent;
    } catch (err) {
      this.logger.warn(
        `Invoice email for ${invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  /** The owner (the org's first account) and every active, unpaused admin. */
  private async recipients(orgId: string) {
    const [owner, admins] = await Promise.all([
      this.prisma.user.findFirst({
        where: { orgId },
        orderBy: { createdAt: 'asc' },
        select: { email: true, firstName: true, lastName: true, status: true },
      }),
      this.prisma.user.findMany({
        where: {
          orgId,
          status: 'active',
          billingPausedAt: null,
          userRoles: { some: { role: { key: 'admin' } } },
        },
        select: { email: true, firstName: true, lastName: true, status: true },
      }),
    ]);
    const seen = new Set<string>();
    return [...(owner && owner.status !== 'disabled' ? [owner] : []), ...admins]
      .filter((u) => {
        const key = u.email.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((u) => ({
        email: u.email,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || undefined,
      }));
  }
}
