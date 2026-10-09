import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { IntegrationsService } from './integrations.service';

// Not listed in PLATFORM_ROUTE_MODULES: the service filters the result by the
// caller's admin_email / admin_settings view access instead.
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/integrations')
export class AdminIntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('status')
  status(@CurrentUser() actor: JwtPayload) {
    return this.integrations.status(actor);
  }
}
