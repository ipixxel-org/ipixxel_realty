import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { PresenceService } from './presence.service';
import { HeartbeatDto } from './dto/heartbeat.dto';

@UseGuards(JwtAuthGuard, OrgApprovedGuard)
@Controller('presence')
export class PresenceController {
  constructor(private readonly service: PresenceService) {}

  @Post('heartbeat')
  @HttpCode(200)
  heartbeat(@CurrentUser() user: JwtPayload, @Body() dto: HeartbeatDto) {
    return this.service.heartbeat(user, dto);
  }
}

// Access maps to the `admin_dashboard` platform module via
// PLATFORM_ROUTE_MODULES (`/admin/presence`).
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/presence')
export class AdminPresenceController {
  constructor(private readonly service: PresenceService) {}

  @Get('live')
  live() {
    return this.service.listLive();
  }
}
