import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { PaymentsService } from './payments.service';
import {
  AdminListPaymentsQueryDto,
  CreateTestOrderDto,
  ListPaymentsQueryDto,
  VerifyPaymentDto,
} from './dto/payments.dto';

// --- Organisation Endpoints ---
@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@Controller('org/payments')
export class OrgPaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @RequirePermission('billing', 'view')
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: ListPaymentsQueryDto) {
    return this.service.listOrgPayments(user.orgId!, query);
  }

  // No @RequirePermission: whichever feature opened Checkout already checked
  // its own permission when it created the order. This only confirms a
  // Razorpay-signed payment, scoped to the caller's organisation.
  @Post('verify')
  @HttpCode(200)
  verify(@CurrentUser() user: JwtPayload, @Body() dto: VerifyPaymentDto) {
    // Never fall through to the unscoped (Super Admin) lookup.
    if (!user.orgId)
      throw new ForbiddenException('Organisation access required');
    return this.service.verifyCheckout(dto, user.orgId);
  }
}

// --- Super Admin Endpoints ---
// /admin/payments is mapped to admin_subscriptions in PLATFORM_ROUTE_MODULES,
// so platform-team roles need that module's view/add permission. The test
// order flow is additionally restricted to the super_admin role.
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  list(@Query() query: AdminListPaymentsQueryDto) {
    return this.service.adminListPayments(query);
  }

  @Post('test-order')
  createTestOrder(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTestOrderDto,
  ) {
    assertSuperAdmin(user);
    return this.service.createTestOrder(dto.organisationId, user.sub);
  }

  @Post('verify')
  @HttpCode(200)
  verify(@CurrentUser() user: JwtPayload, @Body() dto: VerifyPaymentDto) {
    assertSuperAdmin(user);
    return this.service.verifyCheckout(dto, null);
  }
}

function assertSuperAdmin(user: JwtPayload): void {
  if (!user.roles?.includes('super_admin')) {
    throw new ForbiddenException('Super Admin access required');
  }
}

// --- Public webhook ---
/**
 * Razorpay webhook. No auth guard — authenticity is the HMAC of the raw body
 * (main.ts keeps req.rawBody for every JSON request). The event is stored
 * (deduped by x-razorpay-event-id) before replying 200, then processed after
 * the response so Razorpay's 5s timeout is never at risk; processing errors
 * are written to the WebhookEvent row.
 */
@Controller('webhooks/razorpay')
export class RazorpayWebhookController {
  constructor(private readonly service: PaymentsService) {}

  @Post()
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
    @Res() res: Response,
  ) {
    const { webhookEventId, duplicate } = await this.service.ingestWebhook(
      req.rawBody,
      signature,
      eventId,
    );
    res.status(200).json({ received: true, duplicate });
    if (webhookEventId) {
      void this.service
        .processWebhookEvent(webhookEventId)
        .catch(() => undefined);
    }
  }
}
