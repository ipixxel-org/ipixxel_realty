import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { TeamModule } from './modules/team/team.module';
import { AdminOrganisationsModule } from './modules/admin-organisations/admin-organisations.module';
import { OrgSettingsModule } from './modules/org-settings/org-settings.module';
import { OrgUsersModule } from './modules/org-users/org-users.module';
import { AdminTemplatesModule } from './modules/admin-templates/admin-templates.module';
import { OrgTemplatesModule } from './modules/org-templates/org-templates.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { OrgLandingPagesModule } from './modules/org-landing-pages/org-landing-pages.module';
import { PageRevisionsModule } from './modules/page-revisions/page-revisions.module';
import { AdminLandingPagesModule } from './modules/admin-landing-pages/admin-landing-pages.module';
import { OrgActivityModule } from './modules/org-activity/org-activity.module';
import { OrgTypographySetsModule } from './modules/org-typography-sets/org-typography-sets.module';
import { AdminTypographySetsModule } from './modules/admin-typography-sets/admin-typography-sets.module';
import { OrgBillingModule } from './modules/org-billing/org-billing.module';
import { LeadsModule } from './modules/leads/leads.module';
import { SalesAgentsModule } from './modules/sales-agents/sales-agents.module';
import { AdminOrgDomainModule } from './modules/admin-org-domain/admin-org-domain.module';
import { OrgDomainModule } from './modules/org-domain/org-domain.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgTrackingModule } from './modules/org-tracking/org-tracking.module';
import { PublicSiteModule } from './modules/public-site/public-site.module';
import { EmailModule } from './modules/email/email.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { OrgProjectCatalogModule } from './modules/org-project-catalog/org-project-catalog.module';
import { OrgProjectTypesModule } from './modules/org-project-types/org-project-types.module';
import { OrgLeadStageDisplayModule } from './modules/org-lead-stage-display/org-lead-stage-display.module';
import { OrgTeamsModule } from './modules/org-teams/org-teams.module';
import { OrgPermissionsModule } from './modules/org-permissions/org-permissions.module';
import { AdminRolesModule } from './modules/admin-roles/admin-roles.module';
import { OrgDashboardModule } from './modules/org-dashboard/org-dashboard.module';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module';
import { PlatformConfigModule } from './modules/platform-config/platform-config.module';
import { AdminPlatformTeamModule } from './modules/admin-platform-team/admin-platform-team.module';
import { AdminAuditLogsModule } from './modules/admin-audit-logs/admin-audit-logs.module';
import { AdminLeadsModule } from './modules/admin-leads/admin-leads.module';
import { SupportModule } from './modules/support/support.module';
import { TeamChatModule } from './modules/team-chat/team-chat.module';
import { FormsModule } from './modules/forms/forms.module';
import { PackageChangeRequestsModule } from './modules/package-change-requests/package-change-requests.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { OrgReportsModule } from './modules/org-reports/org-reports.module';
import { AttributionLabelsModule } from './modules/attribution-labels/attribution-labels.module';
import { MetaLeadsModule } from './modules/meta-leads/meta-leads.module';
import { MarketingModule } from './modules/marketing/marketing.module';

@Module({
  imports: [
    UploadsModule,
    OrgReportsModule,
    PrismaModule,
    StorageModule,
    AuthModule,
    TeamModule,
    AdminOrganisationsModule,
    OrgSettingsModule,
    OrgUsersModule,
    AdminTemplatesModule,
    OrgTemplatesModule,
    PlansModule,
    SubscriptionsModule,
    OrgLandingPagesModule,
    PageRevisionsModule,
    AdminLandingPagesModule,
    OrgActivityModule,
    OrgTypographySetsModule,
    AdminTypographySetsModule,
    OrgBillingModule,
    LeadsModule,
    SalesAgentsModule,
    ProjectsModule,
    OrgProjectCatalogModule,
    OrgProjectTypesModule,
    OrgLeadStageDisplayModule,
    OrgTeamsModule,
    OrgPermissionsModule,
    AdminRolesModule,
    OrgDashboardModule,
    AdminOrgDomainModule,
    OrgDomainModule,
    NotificationsModule,
    OrgTrackingModule,
    PublicSiteModule,
    EmailModule,
    AdminDashboardModule,
    PlatformConfigModule,
    AdminPlatformTeamModule,
    AdminAuditLogsModule,
    AdminLeadsModule,
    SupportModule,
    TeamChatModule,
    FormsModule,
    PackageChangeRequestsModule,
    AttributionLabelsModule,
    MetaLeadsModule,
    MarketingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

