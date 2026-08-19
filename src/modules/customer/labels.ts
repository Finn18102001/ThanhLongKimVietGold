import type { CustomerGender, CustomerGroup } from "./types";

export const GROUP_LABEL: Record<CustomerGroup, string> = {
  RETAIL: "Khách mới",
  MEMBER: "Thành viên",
  LOYAL: "Thành viên thân thiết",
  VIP: "Khách VIP",
};

export function groupBadgeClass(group: CustomerGroup): string {
  switch (group) {
    case "VIP":
      return "bg-[var(--tlkv-violet-soft)] text-[var(--tlkv-violet)]";
    case "LOYAL":
      return "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]";
    case "MEMBER":
      return "bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]";
    default:
      return "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
  }
}

export const GENDER_LABEL: Record<CustomerGender, string> = {
  MALE: "Nam",
  FEMALE: "Nữ",
  OTHER: "Khác",
};

export function formatPhoneDisplay(phone: string): string {
  if (!phone || phone === "WALKIN") return "";
  if (phone.length === 10) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  if (phone.length === 11) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  return phone;
}

export function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "K";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}
