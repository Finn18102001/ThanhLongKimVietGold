"use server";

import { revalidatePath } from "next/cache";
import { assertAdminWrite } from "@/shared/auth/assert";
import type { ReceiveMetalKind } from "@/modules/inventory/priceLink";
import { createServerSupabase } from "@/shared/supabase/server";

function revalidateInventory() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/order");
  revalidatePath("/inventory/receive");
  revalidatePath("/inventory/adjust");
  revalidatePath("/inventory/history");
  revalidatePath("/inventory/outbound");
  revalidatePath("/inventory/return");
  revalidatePath("/gold-management");
  revalidatePath("/invoices");
  revalidatePath("/cashflow");
  revalidatePath("/");
  revalidatePath("/pos");
}

export async function receivePurchase(formData: FormData) {
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const paidRaw = String(formData.get("paid_dong") ?? "").trim();
  const payMode = String(formData.get("pay_mode") ?? "UNPAID");
  const goodsStatus = String(formData.get("goods_status") ?? "RECEIVED");
  const paymentMethod = String(formData.get("payment_method") ?? "CASH");
  const expectedReceiveAt = String(formData.get("expected_receive_at") ?? "").trim();

  const itemsRaw = String(formData.get("items") ?? "").trim();
  let items: Array<Record<string, unknown>> = [];

  if (itemsRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(itemsRaw);
    } catch {
      throw new Error("Danh sách sản phẩm không hợp lệ.");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Cần ít nhất một sản phẩm trong đơn đặt hàng.");
    }
    items = parsed.map((row) => {
      const r = row as Record<string, unknown>;
      const receivedQty = Number(r.received_qty ?? r.expected_qty ?? 0);
      const costPriceDong = Number(r.cost_price_dong ?? "");
      if (!Number.isInteger(costPriceDong) || costPriceDong < 0) {
        throw new Error("Giá vốn mỗi dòng phải là số nguyên VND không âm.");
      }
      if (!Number.isInteger(receivedQty) || receivedQty <= 0) {
        throw new Error("Số lượng mỗi dòng phải là số nguyên > 0.");
      }
      const item: Record<string, unknown> = {
        sku_id: r.sku_id ? String(r.sku_id) : null,
        expected_qty: Number(r.expected_qty ?? receivedQty),
        received_qty: receivedQty,
        cost_price_dong: costPriceDong,
      };
      if (r.order_product != null && typeof r.order_product === "object") {
        item.order_product = r.order_product;
      }
      const weightChi = Number(r.weight_chi);
      if (r.weight_chi != null && r.weight_chi !== "" && Number.isFinite(weightChi)) {
        item.weight_chi = weightChi;
      }
      const unitCost = Number(r.unit_cost_dong_per_chi);
      if (
        r.unit_cost_dong_per_chi != null &&
        r.unit_cost_dong_per_chi !== "" &&
        Number.isInteger(unitCost)
      ) {
        item.unit_cost_dong_per_chi = unitCost;
      }
      return item;
    });
  } else {
    // Backward-compatible single-item FormData (Nhập hàng / legacy clients).
    const receivedQty = Number(formData.get("received_qty") ?? 0);
    const costPriceDong = Number(formData.get("cost_price_dong") ?? "");
    if (!Number.isInteger(costPriceDong) || costPriceDong < 0) {
      throw new Error("Giá vốn phải là số nguyên VND không âm.");
    }
    const weightChiRaw = String(formData.get("weight_chi") ?? "").trim();
    const unitCostPerChiRaw = String(formData.get("unit_cost_dong_per_chi") ?? "").trim();
    const item: Record<string, unknown> = {
      sku_id: String(formData.get("sku_id") ?? ""),
      expected_qty: Number(formData.get("expected_qty") ?? receivedQty),
      received_qty: receivedQty,
      cost_price_dong: costPriceDong,
    };
    if (weightChiRaw !== "" && Number.isFinite(Number(weightChiRaw))) {
      item.weight_chi = Number(weightChiRaw);
    }
    if (unitCostPerChiRaw !== "" && Number.isInteger(Number(unitCostPerChiRaw))) {
      item.unit_cost_dong_per_chi = Number(unitCostPerChiRaw);
    }
    items = [item];
  }

  const itemsTotal = items.reduce((sum, item) => {
    const qty = Number(item.received_qty ?? 0);
    const cost = Number(item.cost_price_dong ?? 0);
    return sum + cost * qty;
  }, 0);

  let paidDong: number | null = 0;
  if (payMode === "FULL") {
    paidDong = itemsTotal;
  } else if (payMode === "PARTIAL") {
    paidDong = Number(paidRaw);
    if (!Number.isInteger(paidDong) || paidDong < 0) {
      throw new Error("Số đã trả phải là số nguyên VND không âm.");
    }
  } else {
    paidDong = 0;
  }

  const hasOrderProduct = items.some(
    (item) => item.order_product != null && typeof item.order_product === "object",
  );
  const { data, error } = await supabase.rpc(
    hasOrderProduct ? "pos_receive_order_purchase" : "pos_receive_purchase",
    {
    p_idempotency_key: String(formData.get("idempotency_key") || crypto.randomUUID()),
    p_supplier_name: String(formData.get("supplier_name") ?? "").trim(),
    p_reason: String(formData.get("reason") ?? "").trim(),
    p_items: items,
    p_paid_dong: paidDong,
    p_payment_method: paymentMethod,
    p_goods_status: goodsStatus === "NOT_RECEIVED" ? "NOT_RECEIVED" : "RECEIVED",
    p_expected_receive_at: expectedReceiveAt || null,
    p_note: String(formData.get("note") ?? "").trim() || null,
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
    goodsStatus?: string;
    documentStatus?: string;
    orderSkus?: string[];
  };
}

export async function listSuppliers(): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_suppliers");
  if (error) throw new Error(error.message);
  const rows = (data as Array<Record<string, unknown>> | null) ?? [];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    phone: (row.phone as string | null) ?? null,
  }));
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
    purity: row.purity == null || row.purity === "" ? null : String(row.purity),
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
  await assertAdminWrite();
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

/**
 * Lưu tiền công bán vào SKU (`labor_fee_dong`) — prefill HĐ bán.
 * Giữ nguyên đá hiện có; không đụng giá vốn / công nhập.
 */
export async function applySkuSellLaborDong(
  skuId: string,
  sellLaborDong: number,
): Promise<void> {
  if (!skuId) return;
  if (!Number.isInteger(sellLaborDong) || sellLaborDong < 0) {
    throw new Error("Tiền công bán phải là số nguyên VND không âm.");
  }
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const { data: sku, error: loadError } = await supabase
    .from("pos_skus")
    .select("stone_weight_chi, stone_quantity, stone_unit_price_dong, stone_price_dong")
    .eq("id", skuId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!sku) throw new Error("Không tìm thấy mã hàng để ghi tiền công bán.");

  const stoneQuantity = Math.max(0, Math.trunc(Number(sku.stone_quantity ?? 0)));
  const stoneUnitPriceDong = Math.max(0, Math.round(Number(sku.stone_unit_price_dong ?? 0)));
  const legacyStone = Math.max(0, Math.round(Number(sku.stone_price_dong ?? 0)));
  const keepLegacy = stoneQuantity === 0 && stoneUnitPriceDong === 0 && legacyStone > 0;

  const { error } = keepLegacy
    ? await supabase.rpc("pos_set_sku_sale_components", {
        p_sku_id: skuId,
        p_labor_fee_dong: sellLaborDong,
        p_stone_weight_chi: Math.max(0, Number(sku.stone_weight_chi ?? 0)),
        p_stone_price_dong: legacyStone,
      })
    : await supabase.rpc("pos_set_sku_sale_components_v2", {
        p_sku_id: skuId,
        p_labor_fee_dong: sellLaborDong,
        p_stone_weight_chi: Math.max(0, Number(sku.stone_weight_chi ?? 0)),
        p_stone_quantity: stoneQuantity,
        p_stone_unit_price_dong: stoneUnitPriceDong,
      });
  if (error) throw new Error(error.message);
  revalidatePath("/pos");
  revalidatePath("/inventory");
}

/** Resolve SKU id by code then apply sell labor (Order / draft receive returns sku code). */
export async function applySkuSellLaborByCode(
  skuCode: string | null | undefined,
  sellLaborDong: number,
): Promise<void> {
  const code = String(skuCode ?? "").trim();
  if (!code) return;
  if (!Number.isInteger(sellLaborDong) || sellLaborDong < 0) return;
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select("id")
    .eq("sku", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return;
  await applySkuSellLaborDong(String(data.id), sellLaborDong);
}

/** Persist LINK|HESO metadata on SKU (no fixed sell price). Null/legacy → call with LINK. */
export async function applySkuSellPricingDong(
  skuId: string,
  pricing: { mode: "LINK" | "HESO"; hl: number | null; multiplier: number | null },
): Promise<void> {
  if (!skuId) return;
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_set_sku_sell_pricing", {
    p_sku_id: skuId,
    p_mode: pricing.mode,
    p_hl: pricing.mode === "HESO" ? pricing.hl : null,
    p_multiplier: pricing.mode === "HESO" ? pricing.multiplier : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/pos");
  revalidatePath("/inventory");
}

export async function applySkuSellPricingByCode(
  skuCode: string | null | undefined,
  pricing: { mode: "LINK" | "HESO"; hl: number | null; multiplier: number | null },
): Promise<void> {
  const code = String(skuCode ?? "").trim();
  if (!code) return;
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select("id")
    .eq("sku", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return;
  await applySkuSellPricingDong(String(data.id), pricing);
}

/**
 * P9 bạc: lưu `receive_metal_kind` + `manual_sell_dong` (RPC `pos_set_sku_manual_sell`).
 * Vàng: chỉ ghi kind=GOLD (không ghi đè manual sell).
 * Không truyền metalKind + có giá bán > 0 (catalog vá SKU cũ): coi là SILVER.
 */
export async function applySkuManualSellDong(
  skuId: string,
  input: { metalKind?: ReceiveMetalKind | null; manualSellDong: number | null },
): Promise<void> {
  if (!skuId) return;
  await assertAdminWrite();

  let kind: "GOLD" | "SILVER";
  let manual: number | null = null;
  if (input.metalKind === "gold") {
    kind = "GOLD";
  } else if (input.metalKind === "silver") {
    kind = "SILVER";
    const sell = input.manualSellDong;
    if (sell == null || !Number.isInteger(sell) || sell <= 0) {
      throw new Error("Nhập bạc cần giá bán / chiếc là số nguyên VND > 0.");
    }
    manual = sell;
  } else if (
    input.manualSellDong != null &&
    Number.isInteger(input.manualSellDong) &&
    input.manualSellDong > 0
  ) {
    kind = "SILVER";
    manual = input.manualSellDong;
  } else {
    return;
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_set_sku_manual_sell", {
    p_sku_id: skuId,
    p_receive_metal_kind: kind,
    p_manual_sell_dong: manual,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/pos");
  revalidatePath("/inventory");
}

export async function applySkuManualSellByCode(
  skuCode: string | null | undefined,
  input: { metalKind?: ReceiveMetalKind | null; manualSellDong: number | null },
): Promise<void> {
  const code = String(skuCode ?? "").trim();
  if (!code) return;
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select("id")
    .eq("sku", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return;
  await applySkuManualSellDong(String(data.id), input);
}
