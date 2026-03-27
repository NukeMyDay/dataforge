// Email utility for the API — thin wrapper around nodemailer
// Only sends if SMTP_HOST is configured; silently no-ops otherwise

import { createTransport } from "nodemailer";

const SMTP_HOST = process.env["SMTP_HOST"] ?? "";
const SMTP_PORT = Number(process.env["SMTP_PORT"] ?? 587);
const SMTP_USER = process.env["SMTP_USER"] ?? "";
const SMTP_PASSWORD = process.env["SMTP_PASSWORD"] ?? "";
const SMTP_FROM = process.env["SMTP_FROM"] ?? "noreply@gonear.de";

let _transporter: ReturnType<typeof createTransport> | null = null;

function getTransporter() {
  if (!SMTP_HOST) return null;
  if (!_transporter) {
    _transporter = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
    });
  }
  return _transporter;
}

export async function sendEmail(opts: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  await t.sendMail({ from: SMTP_FROM, ...opts });
  return true;
}

export async function sendWelcomeEmail(email: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Welcome to DataForge",
    text: `Welcome to DataForge!\n\nYour account is ready. Get your API key at https://gonear.de/dashboard\n\n— DataForge Team`,
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
<h2 style="color:#2563eb">Welcome to DataForge</h2>
<p>Your account is ready. <a href="https://gonear.de/dashboard" style="color:#2563eb">Get your API key</a> to start querying 50,000+ study programs.</p>
<p><strong>Free tier:</strong> 100 req/day — <a href="https://gonear.de/dashboard" style="color:#2563eb">upgrade to Pro</a> for 10,000 req/day.</p>
<p style="color:#6b7280;font-size:14px">— DataForge Team</p>
</body></html>`,
  });
}
