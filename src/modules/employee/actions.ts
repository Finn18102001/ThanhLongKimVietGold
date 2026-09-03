"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { getSupabasePublicConfig } from "@/shared/supabase/env";
import { mapStaff, mapStaffList } from "./map";
import type { StaffInput, StaffListPage, StaffRecord } from "./types";

function revalidateStaffViews() {
  revalidatePath("/employees");
}

async function callStaffAdmin(body: Record<string, unknown>) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Phiên đăng nhập hết hạn");
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Không lấy được token phiên đăng nhập");
  }

  const { url, publishableKey } = getSupabasePublicConfig();
  const res = await fetch(`${url}/functions/v1/staff-admin`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as {
    error?: string;
    staff?: Parameters<typeof mapStaff>[0];
    ok?: boolean;
  };
  if (!res.ok) {
    throw new Error(payload.error ?? "Thao tác nhân viên thất bại");
  }
  return payload;
}

export async function searchStaff(input: {
  query?: string;
  role?: string | null;
  active?: boolean | null;
  limit?: number;
  offset?: number;
}): Promise<StaffListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_staff", {
    p_query: input.query ?? "",
    p_role: input.role || null,
    p_active: input.active ?? null,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
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

export async function createStaff(input: StaffInput): Promise<StaffRecord> {
  if (!input.password || input.password.length < 8) {
    throw new Error("Mật khẩu tối thiểu 8 ký tự");
  }
  const payload = await callStaffAdmin({
    action: "create",
    fullName: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    role: input.role,
    note: input.note ?? null,
    password: input.password,
  });
  const staff = mapStaff(payload.staff as Parameters<typeof mapStaff>[0]);
  if (input.isShared) {
    const supabase = await createServerSupabase();
    const shared = await supabase.rpc("pos_set_staff_shared", {
      p_id: staff.id,
      p_is_shared: true,
    });
    if (shared.error) throw new Error(shared.error.message);
    staff.isShared = true;
  }
  revalidateStaffViews();
  return staff;
}

export async function updateStaff(id: string, input: StaffInput): Promise<StaffRecord> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_update_staff", {
    p_id: id,
    p_full_name: input.fullName,
    p_phone: input.phone ?? null,
    p_role: input.role,
    p_note: input.note ?? null,
    p_is_active: input.isActive ?? null,
  });
  if (error) throw new Error(error.message);
  if (input.isShared !== undefined) {
    const shared = await supabase.rpc("pos_set_staff_shared", {
      p_id: id,
      p_is_shared: input.isShared,
    });
    if (shared.error) throw new Error(shared.error.message);
  }
  revalidateStaffViews();
  return mapStaff((data as { staff: Parameters<typeof mapStaff>[0] }).staff);
}

export async function setStaffActive(id: string, isActive: boolean): Promise<StaffRecord> {
  const payload = await callStaffAdmin({
    action: "setActive",
    id,
    isActive,
  });
  revalidateStaffViews();
  return mapStaff(payload.staff as Parameters<typeof mapStaff>[0]);
}

export async function resetStaffPassword(id: string, password: string): Promise<void> {
  if (password.length < 8) {
    throw new Error("Mật khẩu tối thiểu 8 ký tự");
  }
  await callStaffAdmin({
    action: "resetPassword",
    id,
    password,
  });
}

export async function deleteStaff(id: string): Promise<void> {
  await callStaffAdmin({
    action: "delete",
    id,
    deleteAuth: true,
  });
  revalidateStaffViews();
}
