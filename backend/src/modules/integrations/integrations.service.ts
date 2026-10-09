import { Injectable } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { MarketingService } from '../marketing/marketing.service';
import { AdminRolesService } from '../admin-roles/admin-roles.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

export type IntegrationStatus = {
  key: string;
  configured: boolean;
  active: boolean;
};

/**
 * Which platform permission module each integration's settings live under.
 * Integrations deliberately has no permission key of its own: each card stays
 * gated by the module whose endpoints it calls (/admin/email → admin_email;
 * the Google OAuth form → admin_settings, the module the Settings page used).
 */
const INTEGRATION_MODULES: Record<string, string> = {
  smtp: 'admin_email',
  'social-login': 'admin_settings',
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly email: EmailService,
    private readonly marketing: MarketingService,
    private readonly adminRoles: AdminRolesService,
  ) {}

  /**
   * Read-only status for the Integrations landing grid. Returns booleans only —
   * never hosts, client IDs or secrets — and only for the integrations the
   * caller can view.
   */
  async status(actor: JwtPayload): Promise<IntegrationStatus[]> {
    const canView = await this.viewableModules(actor);
    const out: IntegrationStatus[] = [];

    if (canView(INTEGRATION_MODULES.smtp)) {
      const smtp = await this.email.getConfig();
      const configured = Boolean(smtp?.host);
      out.push({ key: 'smtp', configured, active: configured && smtp.isActive !== false });
    }

    if (canView(INTEGRATION_MODULES['social-login'])) {
      const creds = await this.marketing.getMarketingCredentials();
      const configured = creds.googleAuthConfigured;
      out.push({ key: 'social-login', configured, active: configured });
    }

    return out;
  }

  private async viewableModules(actor: JwtPayload): Promise<(moduleKey: string) => boolean> {
    if (actor.roles?.includes('super_admin')) return () => true;
    const effective = await this.adminRoles.effectivePlatformPermissions(actor.sub);
    if (effective.unrestricted) return () => true;
    return (moduleKey) => Boolean(effective.permissions[moduleKey]?.view);
  }
}
