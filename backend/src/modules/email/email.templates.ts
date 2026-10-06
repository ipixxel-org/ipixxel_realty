export function getInviteEmailHtml(params: {
  recipientName?: string;
  orgName?: string;
  role: string;
  loginEmail: string;
  tempPassword?: string;
  loginUrl: string;
  customBody?: string;
}): string {
  const { recipientName, orgName, role, loginEmail, tempPassword, loginUrl, customBody } = params;
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const orgText = orgName ? `<strong>${orgName}</strong>` : 'your organization';

  let bodyContent = `<p>You have been invited to join ${orgText} on the <strong>iPixxel Realty</strong> platform as a <strong>${role}</strong>.</p>`;
  if (customBody) {
    bodyContent = customBody
      .replace(/{recipientName}/g, recipientName || 'there')
      .replace(/{orgName}/g, orgName || 'your organization')
      .replace(/{role}/g, role)
      .replace(/{loginUrl}/g, loginUrl)
      .replace(/\n/g, '<br/>');
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to join</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f172a; padding: 28px 32px; text-align: left; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px; line-height: 1.6; }
    .btn { display: inline-block; background: #6366f1; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 20px 0; }
    .creds-box { background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0; border: 1px dashed #cbd5e1; }
    .creds-box p { margin: 4px 0; font-size: 14px; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>iPixxel Realty</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px;">${greeting}</p>
      ${bodyContent}
      
      ${
        tempPassword
          ? `<div class="creds-box">
              <p><strong>Login Email:</strong> <code style="font-size:15px; color:#4338ca; font-weight:bold;">${loginEmail}</code></p>
              <p><strong>Your Temporary Password:</strong> <code style="font-size:15px; color:#4338ca; font-weight:bold;">${tempPassword}</code></p>
              <p style="color:#64748b; font-size:13px;">You will be prompted to set a permanent password upon first signing in.</p>
             </div>`
          : ''
      }

      <div style="text-align: center;">
        <a href="${loginUrl}" class="btn" target="_blank">Sign In to Your Account</a>
      </div>

      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If you weren't expecting this invitation, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} iPixxel Realty. All rights reserved.
    </div>
  </div>
</body>
</html>
`;
}

export function getResetPasswordEmailHtml(params: {
  recipientName?: string;
  resetUrl: string;
  customBody?: string;
}): string {
  const { recipientName, resetUrl, customBody } = params;
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';

  let bodyContent = `<p>We received a request to reset the password for your account. Click the button below to choose a new password.</p>`;
  if (customBody) {
    bodyContent = customBody
      .replace(/{recipientName}/g, recipientName || 'there')
      .replace(/{resetUrl}/g, resetUrl)
      .replace(/\n/g, '<br/>');
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f172a; padding: 28px 32px; text-align: left; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px; line-height: 1.6; }
    .btn { display: inline-block; background: #6366f1; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 20px 0; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>iPixxel Realty</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px;">${greeting}</p>
      ${bodyContent}
      
      <div style="text-align: center;">
        <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
      </div>

      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">This link will expire in 5 minutes. If you did not request a password reset, no further action is required and your account remains secure.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} iPixxel Realty. All rights reserved.
    </div>
  </div>
</body>
</html>
`;
}

export function getUserAccountStatusEmailHtml(params: {
  recipientName?: string;
  status: 'activated' | 'deactivated';
  customBody?: string;
  loginUrl?: string;
}): string {
  const { recipientName, status, customBody, loginUrl } = params;
  const activated = status === 'activated';
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const defaultBody = activated
    ? '<p>Your account has been activated by your Organisation Administrator.</p><p>You can now sign in to your account and access the iPixxel Realty platform.</p>'
    : '<p>Your account has been deactivated by your Organisation Administrator.</p><p>You no longer have access to the iPixxel Realty platform.</p><p>If you believe this was done in error or you need your account reactivated, please contact your Organisation Administrator.</p>';
  const body = customBody
    ? customBody
        .replace(/{recipientName}/g, recipientName || 'there')
        .replace(/{loginUrl}/g, loginUrl || '')
        .replace(/\n/g, '<br/>')
    : defaultBody;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Account ${activated ? 'activated' : 'deactivated'}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
  <div style="max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: #0f172a; padding: 28px 32px;"><h1 style="margin: 0; color: #ffffff; font-size: 20px;">iPixxel Realty</h1></div>
    <div style="padding: 32px; line-height: 1.6;">
      <p style="font-size: 16px;">${greeting}</p>
      ${body}
      ${activated && loginUrl ? `<div style="text-align: center;"><a href="${loginUrl}" style="display: inline-block; background: #6366f1; color: #ffffff; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 20px 0;" target="_blank">Sign In to Your Account</a></div>` : ''}
    </div>
    <div style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">&copy; ${new Date().getFullYear()} iPixxel Realty. All rights reserved.</div>
  </div>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sent when a member changes their own password from My Profile. */
export function getPasswordChangedEmailHtml(params: {
  recipientName?: string;
  loginEmail: string;
  newPassword: string;
  loginUrl: string;
}): string {
  const recipientName = params.recipientName ? escapeHtml(params.recipientName) : '';
  const loginEmail = escapeHtml(params.loginEmail);
  const newPassword = escapeHtml(params.newPassword);
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your password was changed</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
  <div style="max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: #0f172a; padding: 28px 32px;"><h1 style="margin: 0; color: #ffffff; font-size: 20px;">iPixxel Realty</h1></div>
    <div style="padding: 32px; line-height: 1.6;">
      <p style="font-size: 16px;">${greeting}</p>
      <p>The password for your iPixxel Realty account was changed from your profile. You can sign in with these details, or continue to use Sign in with Google.</p>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0; border: 1px dashed #cbd5e1;">
        <p style="margin: 4px 0; font-size: 14px;"><strong>Login Email:</strong> <code style="font-size:15px; color:#4338ca; font-weight:bold;">${loginEmail}</code></p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>Password:</strong> <code style="font-size:15px; color:#4338ca; font-weight:bold;">${newPassword}</code></p>
      </div>
      <div style="text-align: center;"><a href="${params.loginUrl}" style="display: inline-block; background: #6366f1; color: #ffffff; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 20px 0;" target="_blank">Sign In to Your Account</a></div>
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If you did not make this change, reset your password straight away and contact your Organisation Administrator.</p>
    </div>
    <div style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">&copy; ${new Date().getFullYear()} iPixxel Realty. All rights reserved.</div>
  </div>
</body>
</html>
`;
}

export function getVerificationEmailHtml(params: {
  recipientName?: string;
  code: string;
  verifyUrl: string;
}): string {
  const { recipientName, code, verifyUrl } = params;
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f172a; padding: 28px 32px; text-align: left; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px; line-height: 1.6; }
    .code { letter-spacing: 0.35em; font-size: 28px; font-weight: 800; color: #4338ca; background: #eef2ff; border-radius: 10px; padding: 14px 18px; text-align: center; }
    .btn { display: inline-block; background: #6366f1; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 20px 0; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>iPixxel Realty</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px;">${greeting}</p>
      <p>Enter this 6-digit code to verify your email and activate your account.</p>
      <p class="code">${code}</p>
      <div style="text-align: center;">
        <a href="${verifyUrl}" class="btn" target="_blank">Verify email</a>
      </div>
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">This code expires in 60 minutes. If you did not create an account, you can ignore this email.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} iPixxel Realty. All rights reserved.
    </div>
  </div>
</body>
</html>
`;
}

export function getOrgApprovedEmailHtml(params: {
  recipientName?: string;
  orgName?: string;
  loginUrl: string;
}): string {
  const { recipientName, orgName, loginUrl } = params;
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
  const orgText = orgName ? `<strong>${orgName}</strong>` : 'your organisation';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Organisation approved</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f172a; padding: 28px 32px; text-align: left; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px; line-height: 1.6; }
    .btn { display: inline-block; background: #6366f1; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 20px 0; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>iPixxel Realty</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px;">${greeting}</p>
      <p>${orgText} has been approved. You can now sign in and start using your workspace.</p>
      <div style="text-align: center;">
        <a href="${loginUrl}" class="btn" target="_blank">Sign in</a>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} iPixxel Realty. All rights reserved.
    </div>
  </div>
</body>
</html>
`;
}

type OrgStatusKind = 'submitted' | 'rejected' | 'disabled' | 'enabled';

function orgStatusBody(kind: OrgStatusKind, orgName?: string, reason?: string, loginUrl?: string): string {
  const orgText = orgName ? `<strong>${orgName}</strong>` : 'your organisation';

  const signInBtn = `
    <div style="text-align: center;">
      <a href="${loginUrl}" class="btn" target="_blank">Sign In</a>
    </div>`;

  switch (kind) {
    case 'submitted':
      return `
        <p>Thank you for registering ${orgText} on the <strong>iPixxel Realty</strong> platform.</p>
        <p>Your application has been received and is currently under review. We'll email you as soon as your organisation has been approved.</p>
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">Until your application is approved, you won't be able to sign in to your workspace.</p>`;
    case 'rejected':
      return `
        <p>We're sorry — ${orgText} couldn't be approved at this time.</p>
        ${
          reason
            ? `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
              <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #b91c1c;">Reason for rejection</p>
              <p style="margin: 0; font-size: 14px; color: #1e293b;">${reason}</p>
             </div>`
            : ''
        }
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">You're welcome to update the details and re-submit your application, or contact our support team for help.</p>`;
    case 'disabled':
      return `
        <p>${orgText} has been disabled, so sign-in has been temporarily paused.</p>
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If you believe this is a mistake, contact our support team.</p>`;
    case 'enabled':
      return `
        <p>${orgText} has been re-enabled. You can sign in to your workspace again.</p>
        ${signInBtn}`;
  }
}

export function getOrgStatusEmailHtml(params: {
  recipientName?: string;
  orgName?: string;
  status: OrgStatusKind;
  reason?: string;
  loginUrl?: string;
}): string {
  const { recipientName, orgName, status, reason, loginUrl } = params;
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';

  const titles: Record<OrgStatusKind, string> = {
    submitted: 'Application submitted',
    rejected: 'Update on your application',
    disabled: 'Workspace disabled',
    enabled: 'Workspace re-enabled',
  };

  const body = orgStatusBody(status, orgName, reason, loginUrl);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titles[status]}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f172a; padding: 28px 32px; text-align: left; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px; line-height: 1.6; }
    .btn { display: inline-block; background: #6366f1; color: #ffffff !important; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; margin: 20px 0; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>iPixxel Realty</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px;">${greeting}</p>
      ${body}
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If you weren't expecting this email, you can safely ignore it.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} iPixxel Realty. All rights reserved.
    </div>
  </div>
</body>
</html>
`;
}

export function getTestEmailHtml(params: {
  sentAt: string;
  senderName: string;
  host: string;
}): string {
  const { sentAt, senderName, host } = params;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SMTP Test Email</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #059669; padding: 28px 32px; text-align: left; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; }
    .content { padding: 32px; line-height: 1.6; }
    .badge { display: inline-block; background: #d1fae5; color: #065f46; font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 9999px; }
    .details { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-family: monospace; font-size: 13px; }
    .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ SMTP Connection Verified</h1>
    </div>
    <div class="content">
      <p><span class="badge">Success</span></p>
      <p style="font-size: 15px;">This is a test email sent from the <strong>iPixxel Realty Super Admin Console</strong> to verify your SMTP mail configuration.</p>
      <div class="details">
        <strong>SMTP Host:</strong> ${host}<br>
        <strong>Sender Name:</strong> ${senderName}<br>
        <strong>Timestamp:</strong> ${sentAt}
      </div>
      <p style="font-size: 13px; color: #64748b;">Your transactional email delivery pipeline is active and ready to deliver invites, notifications, and alerts.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} iPixxel Realty Platform.
    </div>
  </div>
</body>
</html>
`;
}
