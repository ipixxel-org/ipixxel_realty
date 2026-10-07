import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PageRevisionsController } from './page-revisions.controller';
import { PageRevisionsService } from './page-revisions.service';

@Module({
  imports: [AuthModule],
  controllers: [PageRevisionsController],
  providers: [PageRevisionsService, OrgApprovedGuard, PermissionGuard],
  exports: [PageRevisionsService],
})
export class PageRevisionsModule {}
