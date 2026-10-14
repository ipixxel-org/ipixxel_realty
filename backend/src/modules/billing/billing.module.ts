import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
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

/**
 * Billing v2 (docs/billing-ui-contract.md). Built on the existing payments
 * module (Razorpay Orders + Checkout); PlatformConfigModule is global.
 */
@Module({
  imports: [PrismaModule, AuthModule, PaymentsModule],
  controllers: [OrgBillingV2Controller, AdminBillingController],
  providers: [
    BillingModeService,
    OrgBillingV2Service,
    AdminBillingService,
    OrgApprovedGuard,
    PermissionGuard,
    SuperAdminGuard,
  ],
  exports: [BillingModeService],
})
export class BillingModule {}
