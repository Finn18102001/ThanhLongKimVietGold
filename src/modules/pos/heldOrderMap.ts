import type {
  HeldOrderDetail,
  HeldOrderLine,
  HeldOrderListItem,
  HeldOrderListResult,
  HeldOrderStatus,
} from "./types";

type RpcHeldItem = {
  id: string;
  hold_no: string;
  status: HeldOrderStatus;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_no: string | null;
  is_walk_in: boolean;
  payment_method: "CASH" | "TRANSFER" | "CARD";
  note: string | null;
  estimated_total_dong: number | string;
  item_count: number | string;
  saved_by_email: string;
  created_at: string;
  updated_at: string;
};

type RpcHeldLine = {
  sku_id: string;
  sku: string;
  name: string;
  quantity: number | string;
  unit_price_dong: number | string;
  line_total_dong: number | string;
};

function asObject(data: unknown): Record<string, unknown> {
  if (typeof data === "string") {
    return JSON.parse(data) as Record<string, unknown>;
  }
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  throw new Error("Không đọc được đơn đã lưu.");
}

export function mapHeldOrderListItem(row: RpcHeldItem): HeldOrderListItem {
  return {
    id: row.id,
    holdNo: row.hold_no,
    status: row.status,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerNo: row.customer_no,
    isWalkIn: Boolean(row.is_walk_in),
    paymentMethod: row.payment_method,
    note: row.note,
    estimatedTotalDong: Number(row.estimated_total_dong),
    itemCount: Number(row.item_count),
    savedByEmail: row.saved_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHeldLine(row: RpcHeldLine): HeldOrderLine {
  return {
    skuId: row.sku_id,
    sku: row.sku,
    name: row.name,
    quantity: Number(row.quantity),
    unitPriceDong: Number(row.unit_price_dong),
    lineTotalDong: Number(row.line_total_dong),
  };
}

export function mapHeldOrderList(data: unknown): HeldOrderListResult {
  const payload = asObject(data);
  const items = Array.isArray(payload.items) ? (payload.items as RpcHeldItem[]) : [];
  return {
    ok: payload.ok !== false,
    visibleToAll: Boolean(payload.visible_to_all),
    items: items.map(mapHeldOrderListItem),
  };
}

export function mapHeldOrderDetail(data: unknown): HeldOrderDetail {
  const payload = asObject(data);
  const items = Array.isArray(payload.items) ? (payload.items as RpcHeldLine[]) : [];
  return {
    ...mapHeldOrderListItem(payload as unknown as RpcHeldItem),
    items: items.map(mapHeldLine),
    visibleToAll: Boolean(payload.visible_to_all),
  };
}
