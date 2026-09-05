"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";

function revalidateInventory() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/receive");
  revalidatePath("/inventory/adjust");
  revalidatePath("/inventory/history");
  revalidatePath("/inventory/outbound");
  revalidatePath("/");
  revalidatePath("/pos");
}

export async function receivePurchase(formData: FormData) {
  const supabase = await createServerSupabase();
  const receivedQty = Number(formData.get("received_qty") ?? 0);
  const costPriceDong = Number(formData.get("cost_price_dong") ?? "");
  const paidRaw = String(formData.get("paid_dong") ?? "").trim();
  const payMode = String(formData.get("pay_mode") ?? "UNPAID");
  if (!Number.isInteger(costPriceDong) || costPriceDong < 0) {
    throw new Error("Giá vốn phải là số nguyên VND không âm.");
  }
  let paidDong: number | null = 0;
  if (payMode === "FULL") {
    paidDong = costPriceDong * receivedQty;
  } else if (payMode === "PARTIAL") {
    paidDong = Number(paidRaw);
    if (!Number.isInteger(paidDong) || paidDong < 0) {
      throw new Error("Số đã trả phải là số nguyên VND không âm.");
    }
  } else {
    paidDong = 0;
  }
  const { data, error } = await supabase.rpc("pos_receive_purchase", {
    p_idempotency_key: String(formData.get("idempotency_key") || crypto.randomUUID()),
    p_supplier_name: String(formData.get("supplier_name") ?? "").trim(),
    p_reason: String(formData.get("reason") ?? "").trim(),
    p_items: [
      {
        sku_id: String(formData.get("sku_id") ?? ""),
        expected_qty: Number(formData.get("expected_qty") ?? 0),
        received_qty: receivedQty,
        cost_price_dong: costPriceDong,
      },
    ],
    p_paid_dong: paidDong,
  });
  if (error) {
    throw new Error(error.message);
  }
  revalidateInventory();
  return data as {
    ok: boolean;
    receipt_no: string;
    receipt_id: string;
    totalDong?: number;
    paidDong?: number;
    remainingDong?: number;
    paymentStatus?: string;
  };
}

export async function listBrands(): Promise<import("./types").BrandOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_brands");
  if (error) throw new Error(error.message);
  const rows = (data as Array<Record<string, unknown>> | null) ?? [];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    isActive: Boolean(row.isActive ?? true),
  }));
}

export async function searchLedger(input: {
  from?: string | null;
  to?: string | null;
  brandId?: string | null;
  type?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}): Promise<import("./types").LedgerListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_ledger", {
    p_from: input.from ? `${input.from}T00:00:00+07:00` : null,
    p_to: input.to ? `${input.to}T23:59:59.999+07:00` : null,
    p_brand_id: input.brandId || null,
    p_type: input.type || null,
    p_q: input.q || null,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const raw = data as {
    items?: Array<Record<string, unknown>>;
    total?: number;
    limit?: number;
    offset?: number;
  } | null;
  return {
    items: (raw?.items ?? []).map(mapLedgerRpcRow),
    total: Number(raw?.total ?? 0),
    limit: Number(raw?.limit ?? 50),
    offset: Number(raw?.offset ?? 0),
  };
}

function mapLedgerRpcRow(row: Record<string, unknown>): import("./types").LedgerRow {
  return {
    id: String(row.id),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    type: String(row.type ?? ""),
    quantity: Number(row.quantity ?? 0),
    beforeQuantity: Number(row.beforeQuantity ?? 0),
    afterQuantity: Number(row.afterQuantity ?? 0),
    reason: String(row.reason ?? ""),
    createdAt: String(row.createdAt ?? ""),
    actorEmail: String(row.actorEmail ?? ""),
    referenceType: String(row.referenceType ?? ""),
    referenceId: String(row.referenceId ?? ""),
    costPriceDong: row.costPriceDong == null ? null : Number(row.costPriceDong),
    brandName: (row.brandName as string | null) ?? null,
    customerName: (row.customerName as string | null) ?? null,
    customerPhone: (row.customerPhone as string | null) ?? null,
    customerCitizenId: (row.customerCitizenId as string | null) ?? null,
  };
}

export async function exportLedger(input: {
  from?: string | null;
  to?: string | null;
  brandId?: string | null;
  type?: string | null;
  q?: string | null;
}): Promise<import("./types").LedgerListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_export_ledger", {
    p_from: input.from ? `${input.from}T00:00:00+07:00` : null,
    p_to: input.to ? `${input.to}T23:59:59.999+07:00` : null,
    p_brand_id: input.brandId || null,
    p_type: input.type || null,
    p_q: input.q || null,
  });
  if (error) throw new Error(error.message);
  const raw = data as {
    items?: Array<Record<string, unknown>>;
    total?: number;
    limit?: number;
    offset?: number;
  } | null;
  return {
    items: (raw?.items ?? []).map(mapLedgerRpcRow),
    total: Number(raw?.total ?? 0),
    limit: Number(raw?.limit ?? 0),
    offset: Number(raw?.offset ?? 0),
  };
}

export async function adjustStock(formData: FormData) {
  const supabase = await createServerSupabase();
  const quantity = Number(formData.get("quantity") ?? 0);
  const { data, error } = await supabase.rpc("pos_adjust_stock", {
    p_idempotency_key: crypto.randomUUID(),
    p_sku_id: String(formData.get("sku_id") ?? ""),
    p_quantity: quantity,
    p_reason: String(formData.get("reason") ?? "").trim(),
  });
  if (error) {
    throw new Error(error.message);
  }
  revalidateInventory();
  return data as { ok: boolean; adjustment_id: string };
}
