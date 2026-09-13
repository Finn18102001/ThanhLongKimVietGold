import { formatViDateTime } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";

export type AuditDetailRow = { label: string; value: string };

export type AuditDetailSection = {
  title: string;
  rows?: AuditDetailRow[];
  /** Repeated product/payment blocks (label–value groups). */
  blocks?: AuditDetailRow[][];
};

type SnapshotItem = {
  product_name?: string;
  productName?: string;
  sku?: string | null;
  brand_name?: string | null;
  brandName?: string | null;
  quantity?: number | null;
  weight_chi?: number | null;
  weightChi?: number | null;
  weight_before_chi?: number | null;
  weightBeforeChi?: number | null;
  weight_after_chi?: number | null;
  weightAfterChi?: number | null;
  unit_price_dong?: number | null;
  unitPriceDong?: number | null;
  cost_price_dong?: number | null;
  total_dong?: number | null;
  totalDong?: number | null;
  total_price_dong?: number | null;
};

type SnapshotPayment = {
  amount_dong?: number | null;
  amountDong?: number | null;
  method?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  paidAt?: string | null;
};

type VoidSnapshot = {
  kind?: string;
  customer_name?: string | null;
  customer_citizen_id?: string | null;
  customer_phone?: string | null;
  payment_method?: string | null;
  paid_dong?: number | null;
  remaining_dong?: number | null;
  total_dong?: number | null;
  supplier_name?: string | null;
  reason?: string | null;
  invoice_no?: string | null;
  buy_no?: string | null;
  receipt_no?: string | null;
  items?: SnapshotItem[];
  payments?: SnapshotPayment[];
};

function paymentMethodVi(method: string | null | undefined): string {
  const m = (method ?? "").toUpperCase();
  if (m === "CASH") return "Tiền mặt";
  if (m === "TRANSFER") return "Chuyển khoản";
  if (m === "CARD") return "Thẻ";
  if (m === "MIXED") return "Tiền mặt + Chuyển khoản";
  return method?.trim() || "—";
}

function formatChi(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ`;
}

function dong(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return formatDong(Number(value));
}

function text(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  return t || "—";
}

function asSnapshot(payload: Record<string, unknown> | null | undefined): VoidSnapshot | null {
  const raw = payload?.snapshot;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as VoidSnapshot;
}

function buyOrSaleSections(snapshot: VoidSnapshot, mode: "buy" | "sale"): AuditDetailSection[] {
  const sections: AuditDetailSection[] = [
    {
      title: "Thông tin khách hàng",
      rows: [
        { label: "Khách", value: text(snapshot.customer_name) },
        { label: "CCCD", value: text(snapshot.customer_citizen_id) },
        { label: "SĐT", value: text(snapshot.customer_phone) },
        { label: "Hình thức", value: paymentMethodVi(snapshot.payment_method) },
        {
          label: mode === "buy" ? "Đã chi" : "Đã thu",
          value: dong(snapshot.paid_dong),
        },
        { label: "Còn lại", value: dong(snapshot.remaining_dong) },
      ],
    },
  ];

  const items = snapshot.items ?? [];
  if (items.length > 0) {
    sections.push({
      title: "Chi tiết sản phẩm",
      blocks: items.map((item) => {
        const name = item.product_name ?? item.productName ?? "—";
        const before =
          item.weight_before_chi ?? item.weightBeforeChi ?? item.weight_chi ?? item.weightChi;
        const after =
          item.weight_after_chi ?? item.weightAfterChi ?? item.weight_chi ?? item.weightChi;
        const total = item.total_dong ?? item.totalDong ?? item.total_price_dong;
        const rows: AuditDetailRow[] = [{ label: "Sản phẩm", value: text(name) }];
        if (mode === "buy") {
          rows.push(
            { label: "Trước", value: formatChi(before == null ? null : Number(before)) },
            { label: "Sau", value: formatChi(after == null ? null : Number(after)) },
          );
        } else {
          rows.push(
            { label: "KL", value: formatChi(item.weight_chi ?? item.weightChi) },
            { label: "SL", value: String(item.quantity ?? "—") },
          );
        }
        rows.push({ label: "Tiền", value: dong(total) });
        return rows;
      }),
    });
  }

  return sections;
}

function purchaseSections(snapshot: VoidSnapshot): AuditDetailSection[] {
  const sections: AuditDetailSection[] = [
    {
      title: "Thông tin phiếu",
      rows: [
        { label: "Nguồn hàng", value: text(snapshot.supplier_name) },
        { label: "Lý do", value: text(snapshot.reason) },
      ],
    },
    {
      title: "Thanh toán / Công nợ",
      rows: [
        { label: "Tổng phiếu", value: dong(snapshot.total_dong) },
        { label: "Đã trả", value: dong(snapshot.paid_dong) },
        { label: "Còn phải trả", value: dong(snapshot.remaining_dong) },
        { label: "Hình thức", value: paymentMethodVi(snapshot.payment_method) },
      ],
    },
  ];

  const items = snapshot.items ?? [];
  if (items.length > 0) {
    sections.push({
      title: "Chi tiết hàng",
      blocks: items.map((item) => [
        { label: "Sản phẩm", value: text(item.product_name ?? item.productName) },
        { label: "Mã hàng", value: text(item.sku) },
        { label: "Thương hiệu", value: text(item.brand_name ?? item.brandName) },
        { label: "SL", value: String(item.quantity ?? "—") },
        {
          label: "Giá vốn/cái",
          value: dong(item.cost_price_dong ?? item.unit_price_dong ?? item.unitPriceDong),
        },
        {
          label: "Thành tiền",
          value: dong(item.total_dong ?? item.totalDong ?? item.total_price_dong),
        },
      ]),
    });
  }

  const payments = snapshot.payments ?? [];
  if (payments.length > 0) {
    sections.push({
      title: "Lịch sử thanh toán",
      blocks: payments.map((pay) => [
        { label: "Số tiền", value: dong(pay.amount_dong ?? pay.amountDong) },
        {
          label: "Hình thức",
          value: paymentMethodVi(pay.method ?? pay.payment_method),
        },
        {
          label: "Thời gian",
          value: pay.paid_at || pay.paidAt ? formatViDateTime(String(pay.paid_at ?? pay.paidAt)) : "—",
        },
      ]),
    });
  }

  return sections;
}

/** Prefer structured `payload.snapshot` from void/reverse RPCs. */
export function formatAuditPayloadSections(
  action: string,
  payload: Record<string, unknown> | null | undefined,
): AuditDetailSection[] {
  const snapshot = asSnapshot(payload);
  if (!snapshot) return [];

  const kind = (snapshot.kind || action || "").toUpperCase();
  if (kind.includes("BUY") || action === "BUY_VOID") {
    return buyOrSaleSections(snapshot, "buy");
  }
  if (kind.includes("PURCHASE") || action === "PURCHASE_VOID") {
    return purchaseSections(snapshot);
  }
  if (kind.includes("SALE") || kind.includes("INVOICE") || action === "INVOICE_VOID") {
    return buyOrSaleSections(snapshot, "sale");
  }
  return buyOrSaleSections(snapshot, "sale");
}
