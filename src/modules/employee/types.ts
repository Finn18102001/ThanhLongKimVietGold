export const STAFF_ROLES = ["ADMIN", "STAFF"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffRecord = {
  id: string;
  authUserId: string | null;
  staffNo: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffListPage = {
  items: StaffRecord[];
  total: number;
  limit: number;
  offset: number;
};

export type StaffInput = {
  fullName: string;
  email: string;
  phone?: string | null;
  role: StaffRole;
  note?: string | null;
  password?: string;
  isActive?: boolean;
};
