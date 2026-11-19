/**
 * P10 Module 1 — Feature Flag Quỹ nhân viên.
 * Effective ON only when DB flag is true AND ENV force-off is not set.
 * Default / missing key / force-off → OFF (AS-IS).
 */

export const EMPLOYEE_FUND_FLAG_KEY = "pos_employee_fund_enabled" as const;

/** ENV: set to "1" to force Feature Flag OFF (no force-ON). */
export const EMPLOYEE_FUND_FORCE_OFF_ENV = "TLKV_EMPLOYEE_FUND_FORCE_OFF" as const;

export type EmployeeFundFlagState = {
  /** Kết quả hiệu lực dùng cho nghiệp vụ. */
  enabled: boolean;
  /** Giá trị trong DB (bỏ qua ENV). */
  dbEnabled: boolean;
  /** ENV đang ép tắt. */
  forceOff: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function isEmployeeFundForceOff(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env[EMPLOYEE_FUND_FORCE_OFF_ENV] ?? "").trim() === "1";
}

/** Resolve effective flag from DB bool + ENV. */
export function resolveEmployeeFundEnabled(
  dbEnabled: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isEmployeeFundForceOff(env)) return false;
  return dbEnabled === true;
}
