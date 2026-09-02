import nodemailer from 'nodemailer';
import { log } from './log.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

let cachedConfig: EmailConfig | null = null;

export function setEmailConfig(config: EmailConfig | null) {
  cachedConfig = config;
}

export function getEmailConfig(): EmailConfig | null {
  return cachedConfig;
}

export function isEmailConfigured(): boolean {
  if (!cachedConfig) return false;
  return !!(cachedConfig.host && cachedConfig.user && cachedConfig.pass && cachedConfig.from);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!isEmailConfigured()) throw new Error('Email not configured');

  const config = cachedConfig!;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.from}>`,
    to,
    subject,
    html,
  });

  return true;
}

export function buildPasswordResetEmail(resetLink: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Reset your password</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">We received a request to reset the password for your VoidAuth account. Click the button below to set a new password.</p>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <a href="${resetLink}" style="display:inline-block;padding:10px 24px;background:#000;color:#fff;font-size:14px;font-weight:500;border-radius:24px;text-decoration:none">Reset Password</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildContactAutoReply(name: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Thanks for reaching out</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Hi ${escapeHtml(name)},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5">We've received your message and will get back to you as soon as possible.</p>
          <hr style="margin:20px 0;border:none;border-top:1px solid #eee">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5"><strong>Your message:</strong><br>${escapeHtml(message)}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildContactNotification(name: string, email: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">New Contact Request</h1>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;font-size:13px;color:#333"><strong>Name:</strong> ${escapeHtml(name)}</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#333"><strong>Email:</strong> ${escapeHtml(email)}</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#333"><strong>Message:</strong><br>${escapeHtml(message)}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Admin Notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildMagicLinkEmail(link: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Sign in to VoidAuth</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Click the button below to sign in to your VoidAuth account. This link expires in 1 hour.</p>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <a href="${link}" style="display:inline-block;padding:10px 24px;background:#000;color:#fff;font-size:14px;font-weight:500;border-radius:24px;text-decoration:none">Sign in</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5">If you didn't request this, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildEmailVerification(name: string, link: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Verify your email</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Hi ${escapeHtml(name)},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5">Click the button below to verify your email address. This link expires in 24 hours.</p>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <a href="${link}" style="display:inline-block;padding:10px 24px;background:#000;color:#fff;font-size:14px;font-weight:500;border-radius:24px;text-decoration:none">Verify email</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5">If you didn't create an account, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildOTPEmail(code: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Your verification code</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Use the code below to sign in to your VoidAuth account. This code expires in 5 minutes.</p>
        </td></tr>
        <tr><td style="padding:24px 32px;text-align:center">
          <span style="display:inline-block;padding:12px 32px;background:#f0f0f0;font-size:28px;font-weight:700;letter-spacing:8px;border-radius:8px;font-family:monospace">${code}</span>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5">If you didn't request this, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildLoginAlertEmail(userName: string, ip: string, time: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">New sign-in to your account</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Hi ${escapeHtml(userName)},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5">A new sign-in was detected on your VoidAuth account.</p>
        </td></tr>
        <tr><td style="padding:20px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;padding:16px">
            <tr><td style="padding:4px 16px;font-size:13px;color:#333"><strong>IP address:</strong> ${ip}</td></tr>
            <tr><td style="padding:4px 16px;font-size:13px;color:#333"><strong>Time:</strong> ${time}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5">If this was you, no action is needed. If you don't recognize this activity, please change your password immediately.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildFailedLoginAlertEmail(userName: string, ip: string, attempts: number): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Failed sign-in attempt</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Hi ${escapeHtml(userName)},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5">There ${attempts > 1 ? 'have been' : 'has been'} ${attempts} failed sign-in attempt${attempts > 1 ? 's' : ''} on your VoidAuth account.</p>
        </td></tr>
        <tr><td style="padding:20px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;padding:16px">
            <tr><td style="padding:4px 16px;font-size:13px;color:#333"><strong>IP address:</strong> ${ip}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5">If this wasn't you, please secure your account by changing your password and enabling two-factor authentication.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildPasswordChangedEmail(userName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Password changed</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Hi ${escapeHtml(userName)},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5">Your VoidAuth account password was successfully changed.</p>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:20px 0 0;font-size:12px;color:#999;line-height:1.5">If you made this change, no further action is needed. If you did not authorize this change, please reset your password immediately.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildNewAppConnectionEmail(userName: string, appName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">New app connected</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Hi ${escapeHtml(userName)},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5">A new application has been connected to your VoidAuth account: <strong>${escapeHtml(appName)}</strong>.</p>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:20px 0 0;font-size:12px;color:#999;line-height:1.5">If this was you, no action is needed. You can manage connected apps from your dashboard. If you don't recognize this app, revoke its access immediately.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildStorageWarningEmail(userName: string, usedMB: string, quotaMB: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Storage quota nearly full</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Hi ${userName},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5">Your VoidAuth storage is almost full.</p>
        </td></tr>
        <tr><td style="padding:20px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;padding:16px">
            <tr><td style="padding:4px 16px;font-size:13px;color:#333"><strong>Used:</strong> ${usedMB} MB</td></tr>
            <tr><td style="padding:4px 16px;font-size:13px;color:#333"><strong>Quota:</strong> ${quotaMB} MB</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5">To free up space, you can delete unused files or app data from your storage dashboard.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendNotificationEmail(
  userId: string,
  notificationType: 'login_alert' | 'password_change' | 'new_app_connection' | 'storage_warning',
  subject: string,
  buildHtml: ((userName: string) => string) | ((userName: string) => Promise<string>)
): Promise<void> {
  if (!isEmailConfigured()) return;

  const { queryOne } = await import('../db/connection.js');

  const user = await queryOne<any>(
    `SELECT u.email, u.name, COALESCE(n.login_alert, TRUE) AS login_alert, COALESCE(n.password_change, TRUE) AS password_change, COALESCE(n.new_app_connection, TRUE) AS new_app_connection, COALESCE(n.storage_warning, TRUE) AS storage_warning
     FROM users u
     LEFT JOIN user_notification_prefs n ON n.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );

  if (!user || !user.email) return;
  if (!user[notificationType]) return;

  try {
    const html = await Promise.resolve(buildHtml(user.name));
    await sendEmail(user.email, subject, html);
    log.info(`${notificationType} email sent to ${user.email}`);
  } catch (err: any) {
    log.error(`Failed to send ${notificationType} email`, err.message);
  }
}

export function buildEmailVerificationEmail(link: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="padding:32px 32px 0">
          <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">Verify your email</h1>
          <p style="margin:12px 0 0;font-size:14px;color:#666;line-height:1.5">Please verify your email address for your VoidAuth account. This link expires in 1 hour.</p>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <a href="${link}" style="display:inline-block;padding:10px 24px;background:#000;color:#fff;font-size:14px;font-weight:500;border-radius:24px;text-decoration:none">Verify Email</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0;font-size:12px;color:#999;line-height:1.5">If you didn't create this account, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee">
          <p style="margin:0;font-size:11px;color:#bbb">VoidAuth · Secure Authentication</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
