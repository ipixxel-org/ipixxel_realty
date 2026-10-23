import {
  Body,
  Controller,
  Delete,
  Get,
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
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { PackageChangeRequestsService } from './package-change-requests.service';
import { CreatePackageChangeRequestDto } from './dto/create-package-change-request.dto';
import { RejectPackageChangeRequestDto } from './dto/reject-package-change-request.dto';
import { ListPackageChangeRequestsDto } from './dto/list-package-change-requests.dto';
import {
  MarkRequestPaidDto,
  RequestCouponDto,
} from './dto/mark-request-paid.dto';

// --- Organisation Endpoints ---
@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@Controller('org/billing/package-change-request')
export class OrgPackageChangeRequestsController {
  constructor(private readonly service: PackageChangeRequestsService) {}

  @RequirePermission('billing', 'view')
  @Get()
  getOrgRequest(@CurrentUser() user: JwtPayload) {
    return this.service.getOrgRequest(user.orgId!);
  }

  @RequirePermission('billing', 'edit')
  @Post()
  submitRequest(@Body() dto: CreatePackageChangeRequestDto, @CurrentUser() user: JwtPayload) {
    return this.service.submitOrgRequest(user.orgId!, user.sub, dto);
  }

  @RequirePermission('billing', 'edit')
  @Post(':id/cancel')
  cancelRequest(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.cancelOrgRequest(user.orgId!, id, user.sub);
  }
}

// --- Super Admin Endpoints ---
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/package-change-requests')
export class AdminPackageChangeRequestsController {
  constructor(private readonly service: PackageChangeRequestsService) {}

  @Get()
  listRequests(@Query() query: ListPackageChangeRequestsDto) {
    return this.service.adminListRequests(query);
  }

  /** Manual mode: "Mark as paid" (edit by sending it again) before approving. */
  @Put(':id/payment')
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkRequestPaidDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.markPaid(id, user.sub, dto);
  }

  @Delete(':id/payment')
  clearPayment(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.clearPayment(id, user.sub);
  }

  /** Manual mode: a coupon on a pending request (re-quotes it; clears a marked payment). */
  @Put(':id/coupon')
  applyCoupon(
    @Param('id') id: string,
    @Body() dto: RequestCouponDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.applyCoupon(id, user.sub, dto.code);
  }

  @Delete(':id/coupon')
  removeCoupon(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.removeCoupon(id, user.sub);
  }

  @Post(':id/approve')
  approveRequest(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.adminApproveRequest(id, user.sub);
  }

  @Post(':id/reject')
  rejectRequest(
    @Param('id') id: string,
    @Body() dto: RejectPackageChangeRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.adminRejectRequest(id, user.sub, dto);
  }
}
