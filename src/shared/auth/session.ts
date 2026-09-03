import { createServerSupabase } from "@/shared/supabase/server";
import type { StaffRole } from "./permissions";

export type PosSession = {
  email: string;
  role: StaffRole;
  fullName: string;
  businessDate: string;
  staffId: string | null;
  isShared: boolean;
};

export async function getPosSession(): Promise<PosSession | null> {
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
  };

  const role = row.role === "STAFF" || row.role === "ADMIN" ? row.role : null;
  if (!role || !row.email) return null;

  return {
    email: row.email,
    role,
    fullName: row.full_name?.trim() || row.email.split("@")[0] || "User",
    businessDate: row.business_date || new Date().toISOString().slice(0, 10),
    staffId: row.staff_id ?? null,
    isShared: Boolean(row.is_shared),
  };
}
