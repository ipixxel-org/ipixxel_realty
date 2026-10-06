import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgAdminGuard } from '../../common/guards/org-admin.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { OrgSettingsController } from './org-settings.controller';
import { OrgProfileController } from './org-profile.controller';
import { OrgSettingsService } from './org-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [OrgSettingsController, OrgProfileController],
  providers: [OrgSettingsService, OrgAdminGuard, OrgApprovedGuard, PermissionGuard],
})
export class OrgSettingsModule {}
