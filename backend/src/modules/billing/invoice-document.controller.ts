import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Query,
} from '@nestjs/common';
import { BillingLedgerService } from './billing-ledger.service';
import { verifyInvoiceDocumentSig } from './invoice.util';

/**
 * The printable invoice / credit note. Opened in a new browser tab from
 * Billing → Invoices, so it can't carry the bearer token: the link is signed
 * and expires after an hour (invoiceDocumentUrl). No other access.
 */
@Controller('billing/invoices')
export class InvoiceDocumentController {
  constructor(private readonly ledger: BillingLedgerService) {}

  @Get(':id/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex')
  document(
    @Param('id') id: string,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
  ) {
    if (!verifyInvoiceDocumentSig(id, exp, sig)) {
      throw new ForbiddenException(
        'This invoice link has expired. Open it again from Billing → Invoices.',
      );
    }
    return this.ledger.invoiceDocument(id);
  }
}
