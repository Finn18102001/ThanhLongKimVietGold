/**
 * Future 3 — OTP email HTML (email-client safe: tables + inline CSS).
 * Brand: TLKV vermillion / gold — not marketing landing aesthetics.
 */

const TLKV = {
  red: "#c41a2b",
  headerRed: "#9b0102",
  gold: "#f0e557",
  bg: "#f3f4f6",
  text: "#1f2937",
  muted: "#6b7280",
  line: "#e5e7eb",
  white: "#ffffff",
} as const;

export type OtpEmailContent = {
  toEmail: string;
  code: string;
  expiresMinutes: number;
};

export function buildOtpEmailSubject(): string {
  return "Mã OTP đăng nhập POS — Thăng Long Kim Việt";
}

export function buildOtpEmailText(input: OtpEmailContent): string {
  return [
    "Thăng Long Kim Việt — POS",
    "",
    `Mã OTP đăng nhập của bạn: ${input.code}`,
    `Mã có hiệu lực ${input.expiresMinutes} phút.`,
    "",
    "Không chia sẻ mã này. Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email.",
    "",
    `Tài khoản: ${input.toEmail}`,
  ].join("\n");
}

export function buildOtpEmailHtml(input: OtpEmailContent): string {
  const digits = input.code.replace(/\D/g, "").slice(0, 6).padStart(6, "0");
  const digitCells = digits
    .split("")
    .map(
      (d) => `
      <td align="center" valign="middle" width="40" height="48" style="width:40px;height:48px;background:${TLKV.white};border:1px solid ${TLKV.line};border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:0;color:${TLKV.text};">
        ${d}
      </td>`,
    )
    .join('<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Mã OTP đăng nhập POS</title>
</head>
<body style="margin:0;padding:0;background:${TLKV.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Mã OTP TLKV: ${digits} — hiệu lực ${input.expiresMinutes} phút.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TLKV.bg};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:${TLKV.white};border-radius:12px;overflow:hidden;border:1px solid ${TLKV.line};">
          <tr>
            <td align="center" style="background:${TLKV.headerRed};padding:28px 24px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;color:${TLKV.gold};text-transform:uppercase;">
                THĂNG LONG
              </p>
              <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:0.04em;color:${TLKV.gold};">
                KIM VIỆT
              </p>
            </td>
          </tr>
          <tr>
            <td style="height:3px;background:${TLKV.red};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${TLKV.muted};">
                Xác thực đăng nhập POS
              </p>
              <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;font-weight:700;color:${TLKV.text};">
                Mã OTP của bạn
              </h1>
              <p style="margin:12px 0 0;font-size:14px;line-height:1.55;color:${TLKV.muted};">
                Dùng mã dưới đây để hoàn tất đăng nhập tài khoản
                <strong style="color:${TLKV.text};">${escapeHtml(input.toEmail)}</strong>.
                Mã có hiệu lực <strong style="color:${TLKV.text};">${input.expiresMinutes} phút</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 28px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${digitCells}
                </tr>
              </table>
              <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${TLKV.muted};">
                Hoặc nhập nguyên chuỗi:
                <span style="font-family:Consolas,Monaco,monospace;font-size:16px;font-weight:700;letter-spacing:0.28em;color:${TLKV.text};">${digits}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TLKV.bg};border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;line-height:1.5;color:${TLKV.muted};">
                    Không chia sẻ mã với bất kỳ ai. Nhân viên TLKV không bao giờ hỏi mã OTP qua điện thoại hay chat.
                    Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${TLKV.line};padding:16px 28px 22px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${TLKV.muted};">
              © ${new Date().getFullYear()} Thăng Long Kim Việt · Hệ thống POS
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
