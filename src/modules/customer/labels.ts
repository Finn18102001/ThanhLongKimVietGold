import type { CustomerGender, CustomerGroup, CustomerType } from "./types";

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

export const TYPE_LABEL: Record<CustomerType, string> = {
  INDIVIDUAL: "Cá nhân",
  BUSINESS: "Doanh nghiệp",
};

export const CCCD_DOC_LABEL = {
  CCCD_FRONT: "CCCD mặt trước",
  CCCD_BACK: "CCCD mặt sau",
} as const;

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

export function maskCitizenId(citizenId: string | null | undefined): string {
  const value = (citizenId ?? "").trim();
  if (!value) return "—";
  if (value.length <= 4) return value;
  return `${"*".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
}

export function historyPayLabel(row: {
  remainingDong: number;
  paidDong: number;
  paymentStatus: string;
  transactionType: string;
  fulfillmentStatus: string;
  activityKind?: "SALE" | "BUY";
}): string {
  const pay =
    row.remainingDong <= 0
      ? "Đã thanh toán đủ"
      : row.paidDong <= 0
        ? "Chưa thanh toán"
        : "Thanh toán một phần";
  if (row.activityKind === "BUY" || row.transactionType === "BUY") {
    return pay;
  }
  if (row.transactionType === "PREORDER") {
    const goods =
      row.fulfillmentStatus === "FULFILLED"
        ? "Đã trả hàng"
        : row.fulfillmentStatus === "CANCELLED"
          ? "Đã hủy đặt"
          : "Chưa trả hàng";
    return `${pay} · ${goods}`;
  }
  return pay;
}

export function activityKindLabel(kind: "SALE" | "BUY"): string {
  return kind === "BUY" ? "Mua vào" : "Bán hàng";
}

export function normalizeCitizenIdInput(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function formatCustomerSaveError(message: string): { title: string; reason: string } {
  const text = String(message || "").trim();
  if (/CCCD|căn cước/i.test(text)) {
    return {
      title: "Số CCCD đã tồn tại",
      reason:
        text ||
        "Khách hàng với số căn cước công dân này đã có trong hệ thống. Vui lòng chọn khách đó hoặc nhập số CCCD khác.",
    };
  }
  if (/điện thoại|phone/i.test(text)) {
    return { title: "Số điện thoại đã tồn tại", reason: text };
  }
  return { title: "Không lưu được khách hàng", reason: text || "Vui lòng thử lại." };
}

export function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "K";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}
