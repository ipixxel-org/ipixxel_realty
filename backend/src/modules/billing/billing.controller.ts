import {
  Body,
  Controller,
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
import { SaveLifecycleDto } from './dto/save-lifecycle.dto';
import { BillingProfileService } from './billing-profile.service';
import { BillingCheckoutService } from './billing-checkout.service';
import {
  ConfirmCheckoutDto,
  ListCheckoutsQueryDto,
  PreviewCheckoutDto,
  StartCheckoutDto,
} from './dto/checkout.dto';
import { SaveBillingProfileDto } from './dto/save-billing-profile.dto';

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
  ) {}

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
  ) {}

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
}
