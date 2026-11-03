import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { OrgFormsController } from './org-forms.controller';
import { AdminFormsController } from './admin-forms.controller';
import { PublicFormsController } from './public-forms.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [AuthModule],
  controllers: [OrgFormsController, AdminFormsController, PublicFormsController],
  providers: [FormsService, OrgApprovedGuard, PermissionGuard],
})
export class FormsModule {}