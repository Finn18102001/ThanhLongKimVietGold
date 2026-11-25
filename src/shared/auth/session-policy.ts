/** Shared SRS messages for work-hours + absolute 24h session (Future 1+2). */

export const WORK_HOURS_ENDED_MESSAGE = "Đã hết ca làm việc.";
export const SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn.";
export const OTP_REQUIRED_MESSAGE = "Cần xác thực OTP email.";

export const AUTH_LOGOUT_CHANNEL = "tlkv-auth-logout";

export type WorkHoursInfo = {
  applies: boolean;
  within: boolean;
  start: string;
  end: string;
  warnMinutes: number;
  overrideActive: boolean;
  endAt: string | null;
  warnAt: string | null;
};

export function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** ms until deadline; 0 if already past; null if unknown. */
export function msUntil(iso: string | null | undefined, nowMs = Date.now()): number | null {
  const target = parseIsoMs(iso);
  if (target == null) return null;
  return Math.max(0, target - nowMs);
}
