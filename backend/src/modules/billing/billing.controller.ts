import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { AdminBillingService } from './admin-billing.service';
import { OrgBillingV2Service } from './org-billing-v2.service';
import { SaveAdminPlanDto } from './dto/save-admin-plan.dto';
import {
  SaveCompanyDetailsDto,
  SaveLifecycleDto,
  SaveOnlinePaymentsDto,
} from './dto/save-lifecycle.dto';
import { BillingProfileService } from './billing-profile.service';
import { BillingCheckoutService } from './billing-checkout.service';
import {
  ConfirmCheckoutDto,
  ListCheckoutsQueryDto,
  PreviewCheckoutDto,
  StartCheckoutDto,
} from './dto/checkout.dto';
import { SaveBillingProfileDto } from './dto/save-billing-profile.dto';
import { BillingPlanChangeService } from './billing-plan-change.service';
import { CancelPlanDto, ScheduleDowngradeDto } from './dto/plan-change.dto';
import { BillingRetentionService } from './billing-retention.service';
import {
  RetentionQueryDto,
  SaveRetentionChoicesDto,
} from './dto/retention.dto';
import { AdminCouponsService } from './admin-coupons.service';
import { SaveCouponDto } from './dto/coupon.dto';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { BillingLedgerService } from './billing-ledger.service';
import {
  AdminCancelDto,
  ApplyCouponDto,
  ExtendGraceDto,
  ListAdminPaymentsQueryDto,
  ListSubscriptionsQueryDto,
  MarkPaidOfflineDto,
  PageQueryDto,
  RefundPaymentDto,
} from './dto/admin-subscriptions.dto';

/**
 * Billing v2 — organisation side. Shares the /org/billing prefix with the
 * existing OrgBillingController (GET '', invoices, PATCH plan, POST renew),
 * which is untouched; these paths don't overlap.
 */
@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@Controller('org/billing')
export class OrgBillingV2Controller {
  constructor(
    private readonly service: OrgBillingV2Service,
    private readonly profiles: BillingProfileService,
    private readonly checkouts: BillingCheckoutService,
    private readonly changes: BillingPlanChangeService,
    private readonly retention: BillingRetentionService,
    private readonly ledger: BillingLedgerService,
    private readonly orgCouponList: AdminCouponsService,
  ) {}

  // Step 7: invoices and payment history. Under v2/ because GET
  // /org/billing/invoices is the legacy (flag-off) list.
  @RequirePermission('billing', 'view')
  @Get('v2/invoices')
  invoices(@CurrentUser() user: JwtPayload, @Query() q: PageQueryDto) {
    return this.ledger.listInvoices(user.orgId as string, q.page, q.pageSize);
  }

  @RequirePermission('billing', 'view')
  @Get('v2/payments')
  payments(@CurrentUser() user: JwtPayload, @Query() q: PageQueryDto) {
    return this.ledger.listPayments(user.orgId as string, q.page, q.pageSize);
  }

  // Coupons this organisation can see (reserved for it, or listed publicly).
  @RequirePermission('billing', 'view')
  @Get('coupons')
  orgCoupons(@CurrentUser() user: JwtPayload) {
    return this.orgCouponList.orgCoupons(user.orgId as string);
  }

  // Step 6: choose what stays on a smaller plan
  @RequirePermission('billing', 'view')
  @Get('retention')
  getRetention(
    @CurrentUser() user: JwtPayload,
    @Query() query: RetentionQueryDto,
  ) {
    return this.retention.getChoices(user.orgId as string, query.targetPlanId);
  }

  @RequirePermission('billing', 'edit')
  @Put('retention')
  saveRetention(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveRetentionChoicesDto,
  ) {
    return this.retention.saveChoices(user.orgId as string, user.sub, dto);
  }

  @RequirePermission('billing', 'view')
  @Get('v2')
  overview(@CurrentUser() user: JwtPayload) {
    return this.service.getOverview(user.orgId as string);
  }

  @RequirePermission('billing', 'view')
  @Get('plans')
  plans() {
    return this.service.listPlans();
  }

  @RequirePermission('billing', 'view')
  @Get('access')
  access(@CurrentUser() user: JwtPayload) {
    return this.service.getAccess(user.orgId as string);
  }

  // A read: anyone who can view billing can see a price.
  @RequirePermission('billing', 'view')
  @Post('checkout/preview')
  @HttpCode(200)
  preview(@CurrentUser() user: JwtPayload, @Body() dto: PreviewCheckoutDto) {
    return this.checkouts.preview(user.orgId as string, dto);
  }

  @RequirePermission('billing', 'edit')
  @Post('checkout')
  @HttpCode(200)
  start(@CurrentUser() user: JwtPayload, @Body() dto: StartCheckoutDto) {
    return this.checkouts.start(user.orgId as string, user.sub, dto);
  }

  @RequirePermission('billing', 'edit')
  @Post('checkout/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: JwtPayload, @Body() dto: ConfirmCheckoutDto) {
    return this.checkouts.confirm(user.orgId as string, dto);
  }

  @RequirePermission('billing', 'view')
  @Get('profile')
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.profiles.get(user.orgId as string);
  }

  @RequirePermission('billing', 'edit')
  @Put('profile')
  saveProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveBillingProfileDto,
  ) {
    return this.profiles.save(user.orgId as string, dto);
  }

  // Step 4: cancel / downgrade at the end of the term (and undo). Each returns the overview.
  @RequirePermission('billing', 'edit')
  @Post('cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: JwtPayload, @Body() dto: CancelPlanDto) {
    return this.changes.cancel(user.orgId as string, user.sub, dto);
  }

  @RequirePermission('billing', 'edit')
  @Delete('cancel')
  undoCancel(@CurrentUser() user: JwtPayload) {
    return this.changes.undoCancel(user.orgId as string, user.sub);
  }

  @RequirePermission('billing', 'edit')
  @Post('downgrade')
  @HttpCode(200)
  downgrade(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ScheduleDowngradeDto,
  ) {
    return this.changes.scheduleDowngrade(user.orgId as string, user.sub, dto);
  }

  @RequirePermission('billing', 'edit')
  @Delete('downgrade')
  undoDowngrade(@CurrentUser() user: JwtPayload) {
    return this.changes.undoDowngrade(user.orgId as string, user.sub);
  }
}

/**
 * Billing v2 — Super Admin. SuperAdminGuard maps /admin/billing to
 * admin_subscriptions and /admin/billing/lifecycle to admin_settings
 * (PLATFORM_ROUTE_MODULES); GET needs view, PUT needs edit.
 */
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly service: AdminBillingService,
    private readonly checkouts: BillingCheckoutService,
    private readonly coupons: AdminCouponsService,
    private readonly subscriptions: AdminSubscriptionsService,
    private readonly ledger: BillingLedgerService,
  ) {}

  // Step 7: subscriptions, payments, refunds
  @Get('subscriptions')
  listSubscriptions(@Query() q: ListSubscriptionsQueryDto) {
    return this.subscriptions.list(q);
  }

  @Get('subscriptions/:orgId')
  getSubscription(@Param('orgId') orgId: string) {
    return this.subscriptions.detail(orgId);
  }

  @Post('subscriptions/:orgId/extend-grace')
  @HttpCode(200)
  extendGrace(
    @CurrentUser() user: JwtPayload,
    @Param('orgId') orgId: string,
    @Body() dto: ExtendGraceDto,
  ) {
    return this.subscriptions.extendGrace(orgId, user.sub, dto.days, dto.note);
  }

  @Post('subscriptions/:orgId/offline-payment')
  @HttpCode(200)
  markPaidOffline(
    @CurrentUser() user: JwtPayload,
    @Param('orgId') orgId: string,
    @Body() dto: MarkPaidOfflineDto,
  ) {
    return this.subscriptions.markPaidOffline(orgId, user.sub, dto);
  }

  @Post('subscriptions/:orgId/coupon')
  @HttpCode(200)
  applyCoupon(
    @CurrentUser() user: JwtPayload,
    @Param('orgId') orgId: string,
    @Body() dto: ApplyCouponDto,
  ) {
    return this.subscriptions.applyCoupon(orgId, user.sub, dto.code);
  }

  @Post('subscriptions/:orgId/cancel')
  @HttpCode(200)
  cancelSubscription(
    @CurrentUser() user: JwtPayload,
    @Param('orgId') orgId: string,
    @Body() dto: AdminCancelDto,
  ) {
    return this.subscriptions.cancel(orgId, user.sub, dto.when, dto.note);
  }

  @Get('payments')
  listPayments(@Query() q: ListAdminPaymentsQueryDto) {
    return this.ledger.adminListPayments(q);
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  refund(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.subscriptions.refund(id, user.sub, dto.reason);
  }

  // Step 5: coupons
  @Get('coupons')
  listCoupons() {
    return this.coupons.list();
  }

  @Get('coupons/:code')
  getCoupon(@Param('code') code: string) {
    return this.coupons.get(code);
  }

  @Post('coupons')
  @HttpCode(200)
  createCoupon(@CurrentUser() user: JwtPayload, @Body() dto: SaveCouponDto) {
    return this.coupons.save(dto.coupon, true, user.sub);
  }

  @Put('coupons/:code')
  editCoupon(
    @CurrentUser() user: JwtPayload,
    @Param('code') code: string,
    @Body() dto: SaveCouponDto,
  ) {
    return this.coupons.save(dto.coupon, false, user.sub, code);
  }

  /** Organisations for the coupon form's "only these organisations" picker. */
  @Get('org-options')
  orgOptions() {
    return this.coupons.orgOptions();
  }

  /** Checkouts by status — "needs review" (paid but not applied) by default. */
  @Get('checkouts')
  listCheckouts(@Query() query: ListCheckoutsQueryDto) {
    return this.checkouts.adminList(query.status ?? 'needs_review');
  }

  @Get('plans')
  listPlans() {
    return this.service.listPlans();
  }

  @Put('plans/:id')
  savePlan(@Param('id') id: string, @Body() dto: SaveAdminPlanDto) {
    return this.service.savePlan(id, dto);
  }

  @Get('lifecycle')
  getLifecycle() {
    return this.service.getLifecycle();
  }

  @Put('lifecycle')
  saveLifecycle(@Body() dto: SaveLifecycleDto) {
    return this.service.saveLifecycle(dto);
  }

  // Integrations → Online payments switch (admin_settings, like the
  // lifecycle card it moved from).
  @Get('online-payments')
  getOnlinePayments() {
    return this.service.getOnlinePayments();
  }

  @Put('online-payments')
  saveOnlinePayments(@Body() dto: SaveOnlinePaymentsDto) {
    return this.service.saveOnlinePayments(dto.enabled);
  }

  /**
   * "Run lifecycle check now" — runs the sweep at once (testing aid). Super
   * Admin role only, not every platform role with settings access; audited.
   */
  @Post('lifecycle/run')
  @HttpCode(200)
  runLifecycle(@CurrentUser() user: JwtPayload) {
    if (!user.roles?.includes('super_admin')) {
      throw new ForbiddenException(
        'Only a Super Admin can run the lifecycle check.',
      );
    }
    return this.service.runLifecycleNow(user.sub);
  }

  // Super Admin → Settings → Company & tax details (admin_settings).
  @Get('company')
  getCompany() {
    return this.service.getCompanyDetails();
  }

  @Put('company')
  saveCompany(@Body() dto: SaveCompanyDetailsDto) {
    return this.service.saveCompanyDetails(dto);
  }
}
