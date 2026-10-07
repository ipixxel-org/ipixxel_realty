import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgAdminGuard } from '../../common/guards/org-admin.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
// [DISABLED-TEAMS] Routes commented out; the module is also unregistered in
// app.module.ts. Restore both to bring /org/teams/* back.
// import { OrgTeamsController } from './org-teams.controller';
import { OrgTeamsService } from './org-teams.service';

@Module({
  imports: [AuthModule],
  controllers: [
    // OrgTeamsController, // [DISABLED-TEAMS]
  ],
  providers: [OrgTeamsService, OrgAdminGuard, OrgApprovedGuard],
})
export class OrgTeamsModule {}
