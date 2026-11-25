"use server";

import { createServerSupabase } from "@/shared/supabase/server";

/** Best-effort open shift for STAFF after successful login. Admin paths no-op in RPC. */
export async function openWorkShiftBestEffort(): Promise<void> {
  try {
    const supabase = await createServerSupabase();
    await supabase.rpc("pos_open_work_shift");
  } catch {
    // Do not block login UX on attendance write; gates remain Future 1 SQL.
  }
}

/** Close active shift before sign-out. reason: logout | auto_end_of_day */
export async function closeWorkShiftBestEffort(
  reason: "logout" | "auto_end_of_day",
): Promise<void> {
  try {
    const supabase = await createServerSupabase();
    await supabase.rpc("pos_close_work_shift", { p_reason: reason });
  } catch {
    // Sign-out must still proceed.
  }
}
