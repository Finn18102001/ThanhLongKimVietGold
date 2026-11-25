import nodemailer from "nodemailer";
import {
  buildOtpEmailHtml,
  buildOtpEmailSubject,
  buildOtpEmailText,
  type OtpEmailContent,
} from "./otp-email-template";

export type SendOtpEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: "not_configured" | "send_failed"; detail?: string };

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim() || "tuananh18101@gmail.com";
  const pass = process.env.SMTP_PASS?.trim() || "";
  const from =
    process.env.SMTP_FROM?.trim() ||
    `"Thăng Long Kim Việt POS" <tuananh18101@gmail.com>`;

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user,
    pass,
    from,
    configured: Boolean(user && pass),
  };
}

/** True when SMTP credentials are present (Gmail App Password required). */
export function isOtpSmtpConfigured(): boolean {
  return smtpConfig().configured;
}

export async function sendOtpEmail(input: OtpEmailContent): Promise<SendOtpEmailResult> {
  const cfg = smtpConfig();
  if (!cfg.configured) {
    return { ok: false, reason: "not_configured" };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port === 587,
    auth: {
      user: cfg.user,
      pass: cfg.pass.replace(/\s+/g, ""),
    },
  });

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: input.toEmail,
      subject: buildOtpEmailSubject(),
      text: buildOtpEmailText(input),
      html: buildOtpEmailHtml(input),
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "send_failed";
    return { ok: false, reason: "send_failed", detail };
  }
}
