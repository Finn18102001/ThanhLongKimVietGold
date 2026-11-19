import { createServerSupabase } from "@/shared/supabase/server";
import {
  EMPLOYEE_FUND_FLAG_KEY,
  isEmployeeFundForceOff,
  resolveEmployeeFundEnabled,
  type EmployeeFundFlagState,
} from "@/shared/lib/feature-flags";

export async function getEmployeeFundFlagState(): Promise<EmployeeFundFlagState> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_app_setting_bool", {
    p_key: EMPLOYEE_FUND_FLAG_KEY,
  });
  if (error) {
    throw new Error(error.message || "Không đọc được Feature Flag.");
  }

  const dbEnabled = data === true;
  const forceOff = isEmployeeFundForceOff();

  const { data: row } = await supabase
    .from("pos_app_settings")
    .select("updated_at, updated_by")
    .eq("key", EMPLOYEE_FUND_FLAG_KEY)
    .maybeSingle();

  return {
    dbEnabled,
    forceOff,
    enabled: resolveEmployeeFundEnabled(dbEnabled),
    updatedAt: row?.updated_at ? String(row.updated_at) : null,
    updatedBy: row?.updated_by ? String(row.updated_by) : null,
  };
}

/** Backend gate — mọi nghiệp vụ Quỹ NV sau này phải gọi hàm này. */
export async function isEmployeeFundEnabled(): Promise<boolean> {
  const state = await getEmployeeFundFlagState();
  return state.enabled;
}
