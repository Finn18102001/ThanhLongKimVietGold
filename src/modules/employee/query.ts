import { createServerSupabase } from "@/shared/supabase/server";
import { mapStaff, mapStaffList } from "./map";
import type { StaffListPage, StaffRecord } from "./types";

export async function listStaff(input?: {
  query?: string;
  role?: string | null;
  active?: boolean | null;
  limit?: number;
  offset?: number;
}): Promise<StaffListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_staff", {
    p_query: input?.query ?? "",
    p_role: input?.role || null,
    p_active: input?.active ?? null,
    p_limit: input?.limit ?? 50,
    p_offset: input?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return mapStaffList(
    data as {
      items: Parameters<typeof mapStaffList>[0]["items"];
      total: number;
      limit: number;
      offset: number;
    },
  );
}

export async function getStaff(id: string): Promise<StaffRecord> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_staff", { p_id: id });
  if (error) throw new Error(error.message);
  return mapStaff((data as { staff: Parameters<typeof mapStaff>[0] }).staff);
}
