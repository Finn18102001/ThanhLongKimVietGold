import type { StaffRole } from "./types";

export const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: "Quản trị",
  ADMIN_VIEWER: "Quản trị (chỉ xem)",
  STAFF: "Nhân viên",
};

export function roleBadgeClass(role: StaffRole): string {
  if (role === "ADMIN") return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  if (role === "ADMIN_VIEWER") return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
  return "bg-[var(--tlkv-bg)] text-[var(--tlkv-ink)]";
}

export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
