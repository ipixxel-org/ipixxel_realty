import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MarketingModule } from '../marketing/marketing.module';
import { AdminRolesModule } from '../admin-roles/admin-roles.module';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AdminIntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [AuthModule, MarketingModule, AdminRolesModule],
  controllers: [AdminIntegrationsController],
  providers: [IntegrationsService, SuperAdminGuard],
})
export class IntegrationsModule {}
