export type WorkShiftStatus = "active" | "closed";
export type WorkShiftCloseReason = "logout" | "auto_end_of_day";

export type WorkShiftRow = {
  id: string;
  userId: string | null;
  staffId: string | null;
  employeeEmail: string;
  employeeName: string;
  workDate: string;
  openedAt: string;
  closedAt: string | null;
  status: WorkShiftStatus;
  closeReason: WorkShiftCloseReason | null;
};

export type WorkShiftListPage = {
  items: WorkShiftRow[];
  total: number;
  limit: number;
  offset: number;
  from: string;
  to: string;
};

export type WorkShiftOverview = {
  date: string;
  openedStaffCount: number;
  activeCount: number;
  closedCount: number;
  autoClosedCount: number;
};

export type WorkShiftStaffOption = {
  email: string;
  name: string;
};

export const WORK_SHIFT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Mọi trạng thái" },
  { value: "active", label: "Đang hoạt động" },
  { value: "closed", label: "Đã đóng ca" },
];

export const WORK_SHIFT_CLOSE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Mọi hình thức đóng" },
  { value: "logout", label: "Đăng xuất" },
  { value: "auto_end_of_day", label: "Tự động hết giờ" },
];

export function closeReasonLabel(reason: WorkShiftCloseReason | null): string {
  if (reason === "logout") return "Đăng xuất";
  if (reason === "auto_end_of_day") return "Tự động hết giờ";
  return "—";
}

export function statusLabel(status: WorkShiftStatus): string {
  return status === "active" ? "Đang hoạt động" : "Đã đóng ca";
}
