import type { StaffListPage, StaffRecord, StaffRole } from "./types";

type StaffJson = {
  id: string;
  auth_user_id: string | null;
  staff_no: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export function mapStaff(row: StaffJson): StaffRecord {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    staffNo: row.staff_no,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    isActive: row.is_active,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStaffList(payload: {
  items: StaffJson[] | null;
  total: number;
  limit: number;
  offset: number;
}): StaffListPage {
  return {
    items: (payload.items ?? []).map(mapStaff),
    total: Number(payload.total ?? 0),
    limit: Number(payload.limit ?? 0),
    offset: Number(payload.offset ?? 0),
  };
}
