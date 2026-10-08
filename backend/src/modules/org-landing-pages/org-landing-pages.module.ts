import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgAdminGuard } from '../../common/guards/org-admin.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PageRevisionsModule } from '../page-revisions/page-revisions.module';
import { OrgLandingPagesController } from './org-landing-pages.controller';
import { OrgLandingPagesService } from './org-landing-pages.service';

@Module({
  imports: [AuthModule, PageRevisionsModule],
  controllers: [OrgLandingPagesController],
  providers: [OrgLandingPagesService, OrgAdminGuard, OrgApprovedGuard, PermissionGuard],
})
export class OrgLandingPagesModule {}
