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
  received_at?: string | null;
  receivedAt?: string | null;
  received_by?: string | null;
  receivedBy?: string | null;
  total_quantity?: number | null;
  totalQuantity?: number | null;
  total_weight_chi?: number | null;
  totalWeightChi?: number | null;
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

function itemWeight(item: SnapshotItem): number {
  const w =
    item.weight_chi ??
    item.weightChi ??
    item.weight_after_chi ??
    item.weightAfterChi ??
    item.weight_before_chi ??
    item.weightBeforeChi;
  return w == null || !Number.isFinite(Number(w)) ? 0 : Number(w);
}

function sumSaleWeightChi(items: SnapshotItem[]): number {
  return items.reduce((sum, item) => {
    const qty = item.quantity == null || !Number.isFinite(Number(item.quantity)) ? 1 : Number(item.quantity);
    return sum + itemWeight(item) * qty;
  }, 0);
}

function sumPurchaseQty(items: SnapshotItem[]): number {
  return items.reduce((sum, item) => {
    const qty = item.quantity == null || !Number.isFinite(Number(item.quantity)) ? 0 : Number(item.quantity);
    return sum + qty;
  }, 0);
}

function sumPurchaseWeight(items: SnapshotItem[]): number {
  return items.reduce((sum, item) => {
    const qty = item.quantity == null || !Number.isFinite(Number(item.quantity)) ? 0 : Number(item.quantity);
    return sum + itemWeight(item) * qty;
  }, 0);
}

function saleVoidSections(
  snapshot: VoidSnapshot,
  meta: { voidedAt: string | null; voidedBy: string | null },
): AuditDetailSection[] {
  const items = snapshot.items ?? [];
  const totalChi = snapshot.total_weight_chi ?? snapshot.totalWeightChi ?? sumSaleWeightChi(items);

  const sections: AuditDetailSection[] = [
    {
      title: "Tóm tắt hủy hóa đơn bán",
      rows: [
        { label: "Số HĐ", value: text(snapshot.invoice_no) },
        { label: "Khách hàng (bán cho)", value: text(snapshot.customer_name) },
        { label: "Số chỉ", value: formatChi(totalChi) },
        { label: "Tổng tiền", value: dong(snapshot.total_dong) },
        {
          label: "Thời gian hủy",
          value: meta.voidedAt ? formatViDateTime(meta.voidedAt) : "—",
        },
        { label: "Người thực hiện hủy", value: text(meta.voidedBy) },
      ],
    },
    {
      title: "Thông tin khách hàng",
      rows: [
        { label: "Khách", value: text(snapshot.customer_name) },
        { label: "CCCD", value: text(snapshot.customer_citizen_id) },
        { label: "SĐT", value: text(snapshot.customer_phone) },
        { label: "Hình thức", value: paymentMethodVi(snapshot.payment_method) },
        { label: "Đã thu", value: dong(snapshot.paid_dong) },
        { label: "Còn lại", value: dong(snapshot.remaining_dong) },
      ],
    },
  ];

  if (items.length > 0) {
    sections.push({
      title: "Chi tiết sản phẩm",
      blocks: items.map((item) => {
        const name = item.product_name ?? item.productName ?? "—";
        const total = item.total_dong ?? item.totalDong ?? item.total_price_dong;
        return [
          { label: "Sản phẩm", value: text(name) },
          { label: "KL", value: formatChi(item.weight_chi ?? item.weightChi) },
          { label: "SL", value: String(item.quantity ?? "—") },
          { label: "Tiền", value: dong(total) },
        ];
      }),
    });
  }

  return sections;
}

function buyVoidSections(
  snapshot: VoidSnapshot,
  meta: { voidedAt: string | null; voidedBy: string | null },
): AuditDetailSection[] {
  const items = snapshot.items ?? [];
  const totalChi =
    snapshot.total_weight_chi ??
    snapshot.totalWeightChi ??
    items.reduce((sum, item) => {
      const after = item.weight_after_chi ?? item.weightAfterChi ?? item.weight_chi ?? item.weightChi;
      return sum + (after == null || !Number.isFinite(Number(after)) ? 0 : Number(after));
    }, 0);

  const sections: AuditDetailSection[] = [
    {
      title: "Tóm tắt hủy phiếu mua",
      rows: [
        { label: "Số phiếu", value: text(snapshot.buy_no) },
        { label: "Người bán", value: text(snapshot.customer_name) },
        { label: "Số chỉ", value: formatChi(totalChi) },
        { label: "Tổng tiền", value: dong(snapshot.total_dong) },
        {
          label: "Thời gian hủy",
          value: meta.voidedAt ? formatViDateTime(meta.voidedAt) : "—",
        },
        { label: "Người thực hiện hủy", value: text(meta.voidedBy) },
      ],
    },
    {
      title: "Thông tin khách hàng",
      rows: [
        { label: "Khách", value: text(snapshot.customer_name) },
        { label: "CCCD", value: text(snapshot.customer_citizen_id) },
        { label: "SĐT", value: text(snapshot.customer_phone) },
        { label: "Hình thức", value: paymentMethodVi(snapshot.payment_method) },
        { label: "Đã chi", value: dong(snapshot.paid_dong) },
        { label: "Còn lại", value: dong(snapshot.remaining_dong) },
      ],
    },
  ];

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
        return [
          { label: "Sản phẩm", value: text(name) },
          { label: "Trước", value: formatChi(before == null ? null : Number(before)) },
          { label: "Sau", value: formatChi(after == null ? null : Number(after)) },
          { label: "Tiền", value: dong(total) },
        ];
      }),
    });
  }

  return sections;
}

function purchaseVoidSections(
  snapshot: VoidSnapshot,
  meta: { voidedAt: string | null; voidedBy: string | null },
): AuditDetailSection[] {
  const items = snapshot.items ?? [];
  const receivedAt = snapshot.received_at ?? snapshot.receivedAt ?? null;
  const receivedBy = snapshot.received_by ?? snapshot.receivedBy ?? null;
  const totalQty = snapshot.total_quantity ?? snapshot.totalQuantity ?? sumPurchaseQty(items);
  const totalWeight =
    snapshot.total_weight_chi ?? snapshot.totalWeightChi ?? sumPurchaseWeight(items);

  const sections: AuditDetailSection[] = [
    {
      title: "Tóm tắt hủy phiếu nhập",
      rows: [
        { label: "Số phiếu", value: text(snapshot.receipt_no) },
        {
          label: "Ngày nhập",
          value: receivedAt ? formatViDateTime(String(receivedAt)) : "—",
        },
        { label: "Nguồn hàng / Người bán", value: text(snapshot.supplier_name) },
        {
          label: "Số lượng / Số chỉ",
          value: `${Number(totalQty).toLocaleString("vi-VN")} / ${formatChi(totalWeight)}`,
        },
        { label: "Tổng tiền", value: dong(snapshot.total_dong) },
        { label: "Người thực hiện nhập", value: text(receivedBy) },
        {
          label: "Thời gian hủy",
          value: meta.voidedAt ? formatViDateTime(meta.voidedAt) : "—",
        },
        { label: "Người thực hiện hủy", value: text(meta.voidedBy) },
      ],
    },
    {
      title: "Thông tin phiếu",
      rows: [
        { label: "Nguồn hàng", value: text(snapshot.supplier_name) },
        { label: "Lý do nhập", value: text(snapshot.reason) },
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

  if (items.length > 0) {
    sections.push({
      title: "Chi tiết hàng",
      blocks: items.map((item) => [
        { label: "Sản phẩm", value: text(item.product_name ?? item.productName) },
        { label: "Mã hàng", value: text(item.sku) },
        { label: "Thương hiệu", value: text(item.brand_name ?? item.brandName) },
        { label: "SL", value: String(item.quantity ?? "—") },
        { label: "Số chỉ/SP", value: formatChi(item.weight_chi ?? item.weightChi) },
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
  meta: { voidedAt?: string | null; voidedBy?: string | null } = {},
): AuditDetailSection[] {
  const snapshot = asSnapshot(payload);
  if (!snapshot) return [];

  const voidMeta = {
    voidedAt: meta.voidedAt ?? null,
    voidedBy: meta.voidedBy ?? null,
  };

  const kind = (snapshot.kind || action || "").toUpperCase();
  if (kind.includes("BUY") || action === "BUY_VOID") {
    return buyVoidSections(snapshot, voidMeta);
  }
  if (kind.includes("PURCHASE") || action === "PURCHASE_VOID") {
    return purchaseVoidSections(snapshot, voidMeta);
  }
  if (kind.includes("SALE") || kind.includes("INVOICE") || action === "INVOICE_VOID") {
    return saleVoidSections(snapshot, voidMeta);
  }
  return saleVoidSections(snapshot, voidMeta);
}
