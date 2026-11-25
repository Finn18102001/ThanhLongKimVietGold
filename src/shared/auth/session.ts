import { cache } from "react";
import { createServerSupabase } from "@/shared/supabase/server";
import type { StaffRole } from "./permissions";
import type { WorkHoursInfo } from "./session-policy";

export type OtpInfo = {
  required: boolean;
  verified: boolean;
  verifiedAt: string | null;
};

export type PosSession = {
  email: string;
  role: StaffRole;
  fullName: string;
  businessDate: string;
  staffId: string | null;
  isShared: boolean;
  sessionCreatedAt: string | null;
  sessionExpiresAt: string | null;
  workHours: WorkHoursInfo | null;
  otp: OtpInfo | null;
};

function parseWorkHours(raw: unknown): WorkHoursInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const start = typeof row.start === "string" ? row.start : "";
  const end = typeof row.end === "string" ? row.end : "";
  return {
    applies: Boolean(row.applies),
    within: Boolean(row.within),
    start,
    end,
    warnMinutes: typeof row.warn_minutes === "number" ? row.warn_minutes : Number(row.warn_minutes) || 0,
    overrideActive: Boolean(row.override_active),
    endAt: typeof row.end_at === "string" ? row.end_at : null,
    warnAt: typeof row.warn_at === "string" ? row.warn_at : null,
  };
}

function parseOtp(raw: unknown): OtpInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    required: Boolean(row.required),
    verified: Boolean(row.verified),
    verifiedAt: typeof row.verified_at === "string" ? row.verified_at : null,
  };
}

export const getPosSession = cache(async (): Promise<PosSession | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_session");
  if (error || !data) return null;

  const row = data as {
    email?: string;
    role?: string;
    full_name?: string;
    business_date?: string;
    staff_id?: string | null;
    is_shared?: boolean;
    session_created_at?: string | null;
    session_expires_at?: string | null;
    work_hours?: unknown;
    otp?: unknown;
  };

  const role =
    row.role === "STAFF" || row.role === "ADMIN" || row.role === "ADMIN_VIEWER"
      ? row.role
      : null;
  if (!role || !row.email) return null;

  return {
    email: row.email,
    role,
    fullName: row.full_name?.trim() || row.email.split("@")[0] || "User",
    businessDate: row.business_date || new Date().toISOString().slice(0, 10),
    staffId: row.staff_id ?? null,
    isShared: Boolean(row.is_shared),
    sessionCreatedAt:
      typeof row.session_created_at === "string" ? row.session_created_at : null,
    sessionExpiresAt:
      typeof row.session_expires_at === "string" ? row.session_expires_at : null,
    workHours: parseWorkHours(row.work_hours),
    otp: parseOtp(row.otp),
  };
});
