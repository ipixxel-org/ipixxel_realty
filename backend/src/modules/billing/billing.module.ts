import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { PackageChangeRequestsModule } from '../package-change-requests/package-change-requests.module';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AdminBillingService } from './admin-billing.service';
import { BillingModeService } from './billing-mode.service';
import {
  AdminBillingController,
  OrgBillingV2Controller,
} from './billing.controller';
import { OrgBillingV2Service } from './org-billing-v2.service';
import { BillingProfileService } from './billing-profile.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingPlanChangeService } from './billing-plan-change.service';
import { AdminCouponsService } from './admin-coupons.service';
import { BillingRetentionService } from './billing-retention.service';
import { BillingLedgerService } from './billing-ledger.service';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { InvoiceDocumentController } from './invoice-document.controller';

/**
 * Billing v2 (docs/billing-ui-contract.md). Built on the existing payments
 * module (Razorpay Orders + Checkout); PlatformConfigModule is global.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PaymentsModule,
    PackageChangeRequestsModule,
  ],
  controllers: [
    OrgBillingV2Controller,
    AdminBillingController,
    InvoiceDocumentController,
  ],
  providers: [
    BillingModeService,
    OrgBillingV2Service,
    AdminBillingService,
    BillingProfileService,
    BillingCheckoutService,
    BillingPlanChangeService,
    AdminCouponsService,
    BillingRetentionService,
    BillingLedgerService,
    AdminSubscriptionsService,
    OrgApprovedGuard,
    PermissionGuard,
    SuperAdminGuard,
  ],
  exports: [BillingModeService],
})
export class BillingModule {}
