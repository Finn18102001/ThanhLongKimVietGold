import type { StaffRole } from "./permissions";

/**
 * Future 3 — OTP email cho mọi role ADMIN (active trên pos_staff).
 * SoT SQL: pos_private.otp_email_requires_step2. ADMIN_VIEWER / STAFF không bắt OTP.
 */

export function requiresAdminRoleOtp(role: StaffRole | string | null | undefined): boolean {
  return role === "ADMIN";
}

/** @deprecated Dùng requiresAdminRoleOtp(session.role). Giữ alias tạm cho import cũ. */
export function requiresAdminEmailOtp(
  emailOrRole: string | null | undefined,
): boolean {
  // Nếu caller nhầm truyền role string "ADMIN".
  if (emailOrRole === "ADMIN" || emailOrRole === "STAFF" || emailOrRole === "ADMIN_VIEWER") {
    return requiresAdminRoleOtp(emailOrRole);
  }
  // Không còn allowlist email — luôn false ở đây; gate thật qua session.role / SQL.
  return false;
}

export const OTP_REQUIRED_MESSAGE = "Cần xác thực OTP email.";
