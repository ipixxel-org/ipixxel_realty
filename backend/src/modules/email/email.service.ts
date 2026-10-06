import {
  Injectable,
  Logger,
  BadRequestException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../database/prisma.service';
import {
  UpdateEmailConfigDto,
  SendTestEmailDto,
  ListEmailLogsDto,
} from './dto/email.dto';
import {
  getInviteEmailHtml,
  getResetPasswordEmailHtml,
  getTestEmailHtml,
  getVerificationEmailHtml,
  getOrgApprovedEmailHtml,
  getOrgStatusEmailHtml,
  getUserAccountStatusEmailHtml,
  getPasswordChangedEmailHtml,
} from './email.templates';
import { frontendBaseUrl } from '../../common/utils/app-url.util';

export { frontendBaseUrl, DEFAULT_FRONTEND_URL } from '../../common/utils/app-url.util';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  orgId?: string | null;
  template?:
    | 'invite'
    | 'password_reset'
    | 'password_changed'
    | 'user_account_activated'
    | 'user_account_deactivated'
    | 'test'
    | 'notification'
    | 'system';
  metadata?: Record<string, any>;
}

@Injectable()
export class EmailService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private cachedConfig: any = null;
  private tablesReady = false;

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.ensureEmailTables();
    } catch (err: any) {
      this.logger.warn(`Could not ensure email tables on boot: ${err.message}`);
    }
  }

  /**
   * Production often never ran seed/migrations, so these tables may be missing.
   * GET /config swallows that and returns env defaults; PUT, stats, and logs
   * must create both SMTP config and the dispatch audit table.
   */
  private async ensureEmailTables() {
    if (this.tablesReady) return;

    await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS identity;`);
    await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS audit;`);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS identity.email_configs (
        id TEXT PRIMARY KEY,
        org_id TEXT UNIQUE,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 587,
        secure BOOLEAN NOT NULL DEFAULT false,
        "user" TEXT NOT NULL DEFAULT '',
        password TEXT NOT NULL DEFAULT '',
        from_email TEXT NOT NULL,
        from_name TEXT NOT NULL DEFAULT 'iPixxel Realty',
        reply_to TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        invite_subject TEXT,
        invite_body TEXT,
        reset_subject TEXT,
        reset_body TEXT,
        account_activated_subject TEXT,
        account_activated_body TEXT,
        account_deactivated_subject TEXT,
        account_deactivated_body TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS invite_subject TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS invite_body TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS reset_subject TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS reset_body TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS account_activated_subject TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS account_activated_body TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS account_deactivated_subject TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS account_deactivated_body TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE identity.email_configs ADD COLUMN IF NOT EXISTS org_id TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS email_configs_org_id_key ON identity.email_configs(org_id) WHERE org_id IS NOT NULL;`,
    );
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS audit.email_logs (
        id TEXT PRIMARY KEY,
        org_id TEXT,
        "to" TEXT NOT NULL,
        subject TEXT NOT NULL,
        template TEXT,
        status TEXT NOT NULL,
        error TEXT,
        metadata JSONB,
        sent_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS email_logs_to_idx ON audit.email_logs("to");`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS email_logs_status_idx ON audit.email_logs(status);`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS email_logs_sent_at_idx ON audit.email_logs(sent_at);`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE audit.email_logs ADD COLUMN IF NOT EXISTS org_id TEXT;`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS email_logs_org_id_idx ON audit.email_logs(org_id);`,
    );
    this.tablesReady = true;
  }

  private maskConfig(config: {
    password?: string | null;
    [key: string]: unknown;
  }) {
    return {
      ...config,
      password: config.password ? '••••••••' : '',
      hasPassword: Boolean(config.password),
    };
  }

  private envFallbackConfig() {
    return {
      id: null,
      orgId: null,
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD ? '••••••••' : '',
      hasPassword: Boolean(process.env.SMTP_PASSWORD),
      fromEmail: process.env.SMTP_FROM_EMAIL || 'notifications@ipixxelrealty.com',
      fromName: process.env.SMTP_FROM_NAME || 'iPixxel Realty',
      replyTo: process.env.SMTP_REPLY_TO || null,
      isActive: process.env.SMTP_ACTIVE !== 'false',
      inviteSubject: null,
      inviteBody: null,
      resetSubject: null,
      resetBody: null,
      accountActivatedSubject: null,
      accountActivatedBody: null,
      accountDeactivatedSubject: null,
      accountDeactivatedBody: null,
      usingPlatformFallback: false,
      platformConfigured: Boolean(process.env.SMTP_HOST),
    };
  }

  private async platformConfigured(): Promise<boolean> {
    try {
      const platform = await this.prisma.emailConfig.findFirst({
        where: { orgId: null, isActive: true },
        select: { host: true },
      });
      return Boolean(platform?.host || process.env.SMTP_HOST);
    } catch {
      return Boolean(process.env.SMTP_HOST);
    }
  }

  /**
   * Fetch SMTP config. Pass orgId for organisation settings (never leaks
   * platform credentials). Omit orgId for Super Admin / platform config.
   */
  async getConfig(orgId?: string | null) {
    try {
      await this.ensureEmailTables();
      if (orgId) {
        const config = await this.prisma.emailConfig.findFirst({
          where: { orgId },
        });
        const platformConfigured = await this.platformConfigured();
        if (config) {
          return {
            ...this.maskConfig(config),
            usingPlatformFallback: false,
            platformConfigured,
          };
        }
        let fromName = 'Organisation';
        let fromEmail = '';
        try {
          const org = await this.prisma.organisation.findUnique({
            where: { id: orgId },
            select: { name: true, supportEmail: true },
          });
          if (org?.name) fromName = org.name;
          if (org?.supportEmail) fromEmail = org.supportEmail;
        } catch {
          /* ignore */
        }
        return {
          id: null,
          orgId,
          host: '',
          port: 587,
          secure: false,
          user: '',
          password: '',
          hasPassword: false,
          fromEmail,
          fromName,
          replyTo: null,
          isActive: true,
          inviteSubject: null,
          inviteBody: null,
          resetSubject: null,
          resetBody: null,
          accountActivatedSubject: null,
          accountActivatedBody: null,
          accountDeactivatedSubject: null,
          accountDeactivatedBody: null,
          usingPlatformFallback: platformConfigured,
          platformConfigured,
        };
      }

      const config = await this.prisma.emailConfig.findFirst({
        where: { orgId: null },
        orderBy: { updatedAt: 'desc' },
      });
      if (config) {
        return {
          ...this.maskConfig(config),
          usingPlatformFallback: false,
          platformConfigured: Boolean(config.host),
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not read EmailConfig from DB: ${message}`);
    }

    return this.envFallbackConfig();
  }

  /**
   * Update or create SMTP configuration (platform when orgId is omitted).
   */
  async updateConfig(dto: UpdateEmailConfigDto, orgId?: string | null) {
    await this.ensureEmailTables();

    let existing: any = null;
    try {
      existing = await this.prisma.emailConfig.findFirst({
        where: orgId ? { orgId } : { orgId: null },
        orderBy: { updatedAt: 'desc' },
      });
    } catch (e: any) {
      this.logger.warn('Failed to query emailConfig table: ' + e.message);
    }

    // If password is blank or masked ('••••••••'), preserve existing password
    let passwordToSave = dto.password;
    if (!passwordToSave || passwordToSave === '••••••••') {
      passwordToSave = existing?.password || process.env.SMTP_PASSWORD || '';
    }

    let saved;
    if (existing) {
      saved = await this.prisma.emailConfig.update({
        where: { id: existing.id },
        data: {
          host: dto.host,
          port: dto.port,
          secure: dto.secure,
          user: dto.user || '',
          password: passwordToSave,
          fromEmail: dto.fromEmail,
          fromName: dto.fromName,
          replyTo: dto.replyTo || null,
          isActive: dto.isActive ?? true,
          inviteSubject: dto.inviteSubject === undefined ? existing.inviteSubject : dto.inviteSubject || null,
          inviteBody: dto.inviteBody === undefined ? existing.inviteBody : dto.inviteBody || null,
          resetSubject: dto.resetSubject === undefined ? existing.resetSubject : dto.resetSubject || null,
          resetBody: dto.resetBody === undefined ? existing.resetBody : dto.resetBody || null,
          accountActivatedSubject: dto.accountActivatedSubject === undefined ? existing.accountActivatedSubject : dto.accountActivatedSubject || null,
          accountActivatedBody: dto.accountActivatedBody === undefined ? existing.accountActivatedBody : dto.accountActivatedBody || null,
          accountDeactivatedSubject: dto.accountDeactivatedSubject === undefined ? existing.accountDeactivatedSubject : dto.accountDeactivatedSubject || null,
          accountDeactivatedBody: dto.accountDeactivatedBody === undefined ? existing.accountDeactivatedBody : dto.accountDeactivatedBody || null,
        },
      });
    } else {
      saved = await this.prisma.emailConfig.create({
        data: {
          orgId: orgId || null,
          host: dto.host,
          port: dto.port,
          secure: dto.secure,
          user: dto.user || '',
          password: passwordToSave,
          fromEmail: dto.fromEmail,
          fromName: dto.fromName,
          replyTo: dto.replyTo || null,
          isActive: dto.isActive ?? true,
          inviteSubject: dto.inviteSubject || null,
          inviteBody: dto.inviteBody || null,
          resetSubject: dto.resetSubject || null,
          resetBody: dto.resetBody || null,
          accountActivatedSubject: dto.accountActivatedSubject || null,
          accountActivatedBody: dto.accountActivatedBody || null,
          accountDeactivatedSubject: dto.accountDeactivatedSubject || null,
          accountDeactivatedBody: dto.accountDeactivatedBody || null,
        },
      });
    }

    // Invalidate cached transporter so next send uses updated credentials
    this.transporter = null;
    this.cachedConfig = null;

    return {
      ...this.maskConfig(saved),
      usingPlatformFallback: false,
      platformConfigured: true,
    };
  }

  /**
   * Org SMTP if configured and active; otherwise platform / env.
   */
  private async getTransporter(orgId?: string | null): Promise<{ transporter: Transporter; from: string }> {
    let config: any = null;
    try {
      if (orgId) {
        config = await this.prisma.emailConfig.findFirst({
          where: { orgId, isActive: true },
        });
        if (!config?.host) config = null;
      }
      if (!config) {
        config = await this.prisma.emailConfig.findFirst({
          where: { orgId: null, isActive: true },
          orderBy: { updatedAt: 'desc' },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not load emailConfig: ${err.message}`);
    }

    const host = config?.host || process.env.SMTP_HOST;
    const port = config?.port || Number(process.env.SMTP_PORT) || 587;
    const secure = config ? config.secure : process.env.SMTP_SECURE === 'true';
    const user = config ? config.user : process.env.SMTP_USER;
    const pass = config ? config.password : process.env.SMTP_PASSWORD;
    const fromEmail = config?.fromEmail || process.env.SMTP_FROM_EMAIL || 'notifications@ipixxelrealty.com';
    const fromName = config?.fromName || process.env.SMTP_FROM_NAME || 'iPixxel Realty';

    if (!host) {
      throw new BadRequestException(
        orgId
          ? 'SMTP is not configured. Add your organisation SMTP in Settings → Email, or ask the platform admin to configure platform mail.'
          : 'SMTP Host is not configured in Super Admin settings.',
      );
    }

    const auth = user ? { user, pass } : undefined;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      tls: {
        rejectUnauthorized: false, // Allows flexible self-signed/testing certs
      },
    });

    const from = `"${fromName}" <${fromEmail}>`;
    return { transporter, from };
  }

  /**
   * Core sendMail method used by all features (invites, password resets, notifications).
   * Automatically creates audit logs in EmailLog.
   */
  async sendMail(options: SendMailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { to, subject, html, text, template = 'system', metadata, orgId } = options;

    let errorStr: string | undefined = undefined;
    let messageId: string | undefined = undefined;

    try {
      const { transporter, from } = await this.getTransporter(orgId);

      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>?/gm, ''),
      });

      messageId = info.messageId;
      this.logger.log(`Email dispatched successfully to ${to} [${template}]: ${messageId}`);

      await this.logEmailDispatch({
        orgId,
        to,
        subject,
        template,
        status: 'sent',
        metadata: { ...metadata, messageId },
      });

      return { success: true, messageId };
    } catch (err: any) {
      errorStr = err.message || 'Unknown SMTP error';
      this.logger.error(`Failed to send email to ${to} [${template}]: ${errorStr}`);

      await this.logEmailDispatch({
        orgId,
        to,
        subject,
        template,
        status: 'failed',
        error: errorStr,
        metadata,
      });

      return { success: false, error: errorStr };
    }
  }

  /**
   * Send test email to verify SMTP configuration
   */
  async sendTestEmail(dto: SendTestEmailDto, orgId?: string | null) {
    const config = await this.getConfig(orgId);
    if (!config.host && !orgId) {
      throw new BadRequestException('Please configure an SMTP Host before sending a test email.');
    }
    if (orgId && !config.host) {
      throw new BadRequestException('Save your organisation SMTP host before sending a test email.');
    }

    const sentAt = new Date().toLocaleString();
    const html = getTestEmailHtml({
      host: config.host || '',
      senderName: config.fromName || 'iPixxel Realty',
      sentAt,
    });

    const subject = dto.subject || `SMTP Test Verification - ${config.fromName}`;
    const result = await this.sendMail({
      to: dto.to,
      subject,
      html,
      template: 'test',
      orgId,
      metadata: { initiatedBy: orgId ? 'Organisation SMTP test' : 'Super Admin Test Trigger' },
    });

    if (!result.success) {
      throw new BadRequestException(`Failed to send test email: ${result.error}`);
    }

    return {
      success: true,
      message: `Test email successfully sent to ${dto.to}`,
      messageId: result.messageId,
    };
  }

  /**
   * Query email dispatch logs with pagination
   */
  async listLogs(query: ListEmailLogsDto, orgId?: string | null) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (orgId) where.orgId = orgId;
    if (query.status && query.status !== 'all') {
      where.status = query.status;
    }
    if (query.search) {
      where.OR = [
        { to: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    try {
      await this.ensureEmailTables();
      const [logs, total] = await Promise.all([
        this.prisma.emailLog.findMany({
          where,
          orderBy: { sentAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.emailLog.count({ where }),
      ]);

      return {
        data: logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not load email logs: ${message}`);
      return { data: [], total: 0, page: 1, limit, totalPages: 0 };
    }
  }

  /**
   * Get stats for Super Admin dashboard / email settings
   */
  async getStats(orgId?: string | null) {
    try {
      await this.ensureEmailTables();
      const where = orgId ? { orgId } : {};
      const [totalSent, totalFailed, lastLog] = await Promise.all([
        this.prisma.emailLog.count({ where: { ...where, status: 'sent' } }),
        this.prisma.emailLog.count({ where: { ...where, status: 'failed' } }),
        this.prisma.emailLog.findFirst({ where, orderBy: { sentAt: 'desc' } }),
      ]);

      return {
        totalSent,
        totalFailed,
        totalDispatched: totalSent + totalFailed,
        lastDispatchedAt: lastLog?.sentAt || null,
      };
    } catch {
      return {
        totalSent: 0,
        totalFailed: 0,
        totalDispatched: 0,
        lastDispatchedAt: null,
      };
    }
  }

  /**
   * Helper to write to audit.EmailLog safely
   */
  private async logEmailDispatch(data: {
    orgId?: string | null;
    to: string;
    subject: string;
    template: string;
    status: string;
    error?: string;
    metadata?: any;
  }) {
    try {
      await this.ensureEmailTables();
      await this.prisma.emailLog.create({
        data: {
          orgId: data.orgId || null,
          to: data.to,
          subject: data.subject,
          template: data.template,
          status: data.status,
          error: data.error || null,
          metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Could not record EmailLog entry: ${message}`);
    }
  }

  // --- Ready-to-use helpers for application triggers ---

  async sendInviteEmail(params: {
    to: string;
    recipientName?: string;
    orgName?: string;
    orgId?: string;
    role: string;
    tempPassword?: string;
    loginUrl?: string;
  }) {
    const loginUrl =
      params.loginUrl || `${frontendBaseUrl()}/login`;

    const config = await this.getConfig(params.orgId);

    const html = getInviteEmailHtml({
      recipientName: params.recipientName,
      orgName: params.orgName,
      role: params.role,
      loginEmail: params.to,
      tempPassword: params.tempPassword,
      loginUrl,
      customBody: config.inviteBody || undefined,
    });

    let subject = config.inviteSubject || `You've been invited to join ${params.orgName || 'iPixxel Realty'}`;
    subject = subject
      .replace(/{orgName}/g, params.orgName || 'iPixxel Realty')
      .replace(/{recipientName}/g, params.recipientName || 'there')
      .replace(/{role}/g, params.role);

    return this.sendMail({
      to: params.to,
      subject,
      html,
      template: 'invite',
      orgId: params.orgId,
      metadata: { orgName: params.orgName, role: params.role },
    });
  }

  async sendPasswordResetEmail(params: {
    to: string;
    recipientName?: string;
    resetToken: string;
    resetUrl?: string;
    orgId?: string | null;
  }) {
    const resetUrl =
      params.resetUrl ||
      `${frontendBaseUrl()}/reset-password?token=${encodeURIComponent(params.resetToken)}`;

    const config = await this.getConfig(params.orgId);

    const html = getResetPasswordEmailHtml({
      recipientName: params.recipientName,
      resetUrl,
      customBody: config.resetBody || undefined,
    });

    let subject = config.resetSubject || 'Reset your iPixxel Realty password';
    subject = subject.replace(/{recipientName}/g, params.recipientName || 'there');

    return this.sendMail({
      to: params.to,
      subject,
      html,
      template: 'password_reset',
      orgId: params.orgId,
      metadata: { tokenPrefix: params.resetToken.substring(0, 6) },
    });
  }

  async sendVerificationEmail(params: {
    to: string;
    recipientName?: string;
    code: string;
    orgId?: string | null;
  }) {
    const verifyUrl = `${frontendBaseUrl()}/verify-email?email=${encodeURIComponent(params.to)}`;
    const html = getVerificationEmailHtml({
      recipientName: params.recipientName,
      code: params.code,
      verifyUrl,
    });
    return this.sendMail({
      to: params.to,
      subject: 'Verify your iPixxel Realty email',
      html,
      template: 'notification',
      orgId: params.orgId,
      metadata: { kind: 'email_verification' },
    });
  }

  async sendUserAccountStatusEmail(params: {
    to: string;
    recipientName?: string;
    status: 'activated' | 'deactivated';
    orgId?: string | null;
    // Overrides the sign-in link in the "activated" email. Defaults to the
    // organisation login (/login); Platform Team members pass /admin-login.
    loginUrl?: string;
  }) {
    const config = await this.getConfig(params.orgId);
    const activated = params.status === 'activated';
    const subject = (
      (activated ? config.accountActivatedSubject : config.accountDeactivatedSubject) ||
      (activated
        ? 'Your iPixxel Realty Account Has Been Activated'
        : 'Your iPixxel Realty Account Has Been Deactivated')
    ).replace(/{recipientName}/g, params.recipientName || 'there');
    const html = getUserAccountStatusEmailHtml({
      recipientName: params.recipientName,
      status: params.status,
      customBody: activated
        ? config.accountActivatedBody || undefined
        : config.accountDeactivatedBody || undefined,
      loginUrl: activated
        ? params.loginUrl || `${frontendBaseUrl()}/login`
        : undefined,
    });

    return this.sendMail({
      to: params.to,
      subject,
      html,
      template: activated ? 'user_account_activated' : 'user_account_deactivated',
      orgId: params.orgId,
    });
  }

  /** A member changed their own password from My Profile — sends the new
   *  credentials so they can sign in manually as well as with Google. */
  async sendPasswordChangedEmail(params: {
    to: string;
    recipientName?: string;
    newPassword: string;
    orgId?: string | null;
  }) {
    const html = getPasswordChangedEmailHtml({
      recipientName: params.recipientName,
      loginEmail: params.to,
      newPassword: params.newPassword,
      loginUrl: `${frontendBaseUrl()}/login`,
    });

    return this.sendMail({
      to: params.to,
      subject: 'Your iPixxel Realty password was changed',
      html,
      template: 'password_changed',
      orgId: params.orgId,
    });
  }

  async sendOrgApprovedEmail(params: {
    to: string;
    recipientName?: string;
    orgName?: string;
  }) {
    const html = getOrgApprovedEmailHtml({
      recipientName: params.recipientName,
      orgName: params.orgName,
      loginUrl: `${frontendBaseUrl()}/login`,
    });
    return this.sendMail({
      to: params.to,
      subject: `${params.orgName || 'Your organisation'} is approved — you can sign in`,
      html,
      template: 'notification',
      metadata: { kind: 'org_approved', orgName: params.orgName },
    });
  }

  /**
   * Org lifecycle status-change email (submitted / rejected / disabled /
   * re-enabled). Wired into org registration, wizard completion, rejection
   * and status toggle flows.
   */
  async sendOrgStatusEmail(params: {
    to: string;
    recipientName?: string;
    orgName?: string;
    status: 'submitted' | 'rejected' | 'disabled' | 'enabled';
    reason?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const orgName = params.orgName || 'Your organisation';

    const subjects: Record<typeof params.status, string> = {
      submitted: `${orgName} — application submitted`,
      rejected: `Update on your ${orgName} application`,
      disabled: `Your ${orgName} workspace has been disabled`,
      enabled: `Your ${orgName} workspace has been re-enabled`,
    };

    const html = getOrgStatusEmailHtml({
      recipientName: params.recipientName,
      orgName: params.orgName,
      status: params.status,
      reason: params.reason,
      loginUrl: `${frontendBaseUrl()}/login`,
    });

    return this.sendMail({
      to: params.to,
      subject: subjects[params.status],
      html,
      template: 'notification',
      metadata: {
        kind: `org_${params.status}`,
        orgName: params.orgName,
        reason: params.reason ?? null,
      },
    });
  }
}
