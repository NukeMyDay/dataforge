// Minimal SMTP email sender using Node.js net module (no external deps)
// Supports plain SMTP with STARTTLS via the 'tls' module
import { createTransport } from "nodemailer";
const SMTP_HOST = process.env["SMTP_HOST"] ?? "";
const SMTP_PORT = Number(process.env["SMTP_PORT"] ?? 587);
const SMTP_USER = process.env["SMTP_USER"] ?? "";
const SMTP_PASSWORD = process.env["SMTP_PASSWORD"] ?? "";
const SMTP_FROM = process.env["SMTP_FROM"] ?? "noreply@gonear.de";
// Lazy-created transporter — only initialised when SMTP_HOST is set
let _transporter = null;
function getTransporter() {
    if (!SMTP_HOST)
        return null;
    if (!_transporter) {
        _transporter = createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465, // true for SSL, false for STARTTLS
            auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
        });
    }
    return _transporter;
}
// Returns true if email was sent, false if SMTP is not configured (silent no-op)
export async function sendEmail(opts) {
    const transport = getTransporter();
    if (!transport) {
        console.debug(`[email] SMTP not configured — skipping email to ${opts.to}: ${opts.subject}`);
        return false;
    }
    await transport.sendMail({
        from: SMTP_FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
    });
    return true;
}
// ─── Templated emails ────────────────────────────────────────────────────────
export async function sendWelcomeEmail(email) {
    await sendEmail({
        to: email,
        subject: "Welcome to DataForge",
        text: `Hi,

Welcome to DataForge! Your account is ready.

Get your API key at https://gonear.de/dashboard and start querying 50,000+ study programs and regulatory data.

Free tier: 100 requests/day. Upgrade to Pro for 10,000 requests/day.

Questions? Reply to this email.

— DataForge Team`,
        html: `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="color: #2563eb;">Welcome to DataForge</h2>
  <p>Your account is ready. Head to your <a href="https://gonear.de/dashboard" style="color: #2563eb;">dashboard</a> to generate your first API key.</p>
  <ul>
    <li>50,000+ accredited study programs across Europe</li>
    <li>German regulatory data (NRW event permits)</li>
    <li>REST API + MCP endpoint for AI agents</li>
  </ul>
  <p><strong>Free tier:</strong> 100 req/day — <a href="https://gonear.de/dashboard" style="color: #2563eb;">upgrade to Pro</a> for 10,000 req/day.</p>
  <p style="color: #6b7280; font-size: 14px;">— DataForge Team</p>
</body>
</html>`,
    });
}
export async function sendApiKeyQuotaWarningEmail(email, usedPercent) {
    await sendEmail({
        to: email,
        subject: `DataForge: you've used ${usedPercent}% of your daily quota`,
        text: `Hi,

You've used ${usedPercent}% of your daily API request quota.

Upgrade to Pro for 100× more requests at https://gonear.de/dashboard

— DataForge Team`,
        html: `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="color: #d97706;">Quota warning: ${usedPercent}% used</h2>
  <p>You've used <strong>${usedPercent}%</strong> of your daily API quota.</p>
  <p>Upgrade to Pro for 10,000 requests/day (100× more).</p>
  <p><a href="https://gonear.de/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Upgrade to Pro</a></p>
  <p style="color: #6b7280; font-size: 14px;">— DataForge Team</p>
</body>
</html>`,
    });
}
export async function sendApiKeyExpiryWarningEmail(email, keyName, daysLeft) {
    await sendEmail({
        to: email,
        subject: `DataForge: API key "${keyName}" expires in ${daysLeft} days`,
        text: `Hi,

Your DataForge API key "${keyName}" expires in ${daysLeft} days.

Visit your dashboard to generate a new key: https://gonear.de/dashboard

— DataForge Team`,
        html: `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="color: #dc2626;">API key expiring soon</h2>
  <p>Your API key <strong>${keyName}</strong> expires in <strong>${daysLeft} days</strong>.</p>
  <p><a href="https://gonear.de/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Manage API keys</a></p>
  <p style="color: #6b7280; font-size: 14px;">— DataForge Team</p>
</body>
</html>`,
    });
}
//# sourceMappingURL=email.js.map