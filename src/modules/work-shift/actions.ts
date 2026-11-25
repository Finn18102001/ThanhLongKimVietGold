"use server";

import { createServerSupabase } from "@/shared/supabase/server";
import type {
  WorkShiftCloseReason,
  WorkShiftListPage,
  WorkShiftOverview,
  WorkShiftRow,
  WorkShiftStaffOption,
  WorkShiftStatus,
} from "./types";

function mapRow(raw: Record<string, unknown>): WorkShiftRow {
  const status = raw.status === "active" ? "active" : "closed";
  const reasonRaw = raw.close_reason;
  const closeReason: WorkShiftCloseReason | null =
    reasonRaw === "logout" || reasonRaw === "auto_end_of_day" ? reasonRaw : null;
  return {
    id: String(raw.id),
    userId: raw.user_id ? String(raw.user_id) : null,
    staffId: raw.staff_id ? String(raw.staff_id) : null,
    employeeEmail: String(raw.employee_email ?? ""),
    employeeName: String(raw.employee_name ?? ""),
    workDate: String(raw.work_date ?? "").slice(0, 10),
    openedAt: String(raw.opened_at ?? ""),
    closedAt: raw.closed_at ? String(raw.closed_at) : null,
    status: status as WorkShiftStatus,
    closeReason,
  };
}

export async function getWorkShiftOverview(date?: string | null): Promise<WorkShiftOverview> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_work_shift_overview", {
    p_date: date || null,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    date: String(row.date ?? date ?? "").slice(0, 10),
    openedStaffCount: Number(row.opened_staff_count ?? 0),
    activeCount: Number(row.active_count ?? 0),
    closedCount: Number(row.closed_count ?? 0),
    autoClosedCount: Number(row.auto_closed_count ?? 0),
  };
}

export async function listWorkShifts(input: {
  from?: string | null;
  to?: string | null;
  email?: string | null;
  status?: string | null;
  closeReason?: string | null;
  limit?: number;
  offset?: number;
}): Promise<WorkShiftListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_work_shifts", {
    p_from: input.from || null,
    p_to: input.to || null,
    p_email: input.email || null,
    p_status: input.status || null,
    p_close_reason: input.closeReason || null,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as {
    items?: Array<Record<string, unknown>>;
    total?: number;
    limit?: number;
    offset?: number;
    from?: string;
    to?: string;
  };
  return {
    items: (payload.items ?? []).map(mapRow),
    total: Number(payload.total ?? 0),
    limit: Number(payload.limit ?? input.limit ?? 50),
    offset: Number(payload.offset ?? input.offset ?? 0),
    from: String(payload.from ?? input.from ?? "").slice(0, 10),
    to: String(payload.to ?? input.to ?? "").slice(0, 10),
  };
}

export async function listWorkShiftStaffOptions(): Promise<WorkShiftStaffOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_work_shift_staff");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    email: String(row.email ?? ""),
    name: String(row.name ?? row.email ?? ""),
  }));
}
