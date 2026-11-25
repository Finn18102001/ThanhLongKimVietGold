/** Future 3 — fixed Admin allowlist requiring email OTP every login. */

export const ADMIN_OTP_ALLOWLIST = [
  "tuananh18101@gmail.com",
  "thanglongkimviet@gmail.com",
] as const;

export function requiresAdminEmailOtp(email: string | null | undefined): boolean {
  const normalized = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return ADMIN_OTP_ALLOWLIST.some((item) => item === normalized);
}

export const OTP_REQUIRED_MESSAGE = "Cần xác thực OTP email.";
