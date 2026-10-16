import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgAdminGuard } from '../../common/guards/org-admin.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ProjectEditableGuard } from '../../common/guards/project-editable.guard';
import { ProjectsController } from './projects.controller';
import { OrgUnitsController } from './org-units.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuthModule],
  // OrgUnitsController serves the standalone-unit API (/org/units) the
  // all-units pages call. It was imported but never registered, so every one
  // of those routes 404d.
  controllers: [ProjectsController, OrgUnitsController],
  providers: [
    ProjectsService,
    OrgAdminGuard,
    OrgApprovedGuard,
    PermissionGuard,
    ProjectEditableGuard,
  ],
})
export class ProjectsModule {}
