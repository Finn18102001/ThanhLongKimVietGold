"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import type { StockCountListRow, StockCountSession } from "./count-types";

function revalidateCount() {
  revalidatePath("/inventory/count");
  revalidatePath("/inventory");
  revalidatePath("/audit");
}

function mapSession(raw: Record<string, unknown>): StockCountSession {
  const summary = (raw.summary ?? {}) as Record<string, number>;
  return {
    id: String(raw.id),
    countNo: String(raw.count_no),
    warehouse: String(raw.warehouse),
    scopeType: raw.scope_type as StockCountSession["scopeType"],
    scopeValue: raw.scope_value ? String(raw.scope_value) : null,
    status: raw.status as StockCountSession["status"],
    note: raw.note ? String(raw.note) : null,
    actorEmail: String(raw.actor_email),
    approvedBy: raw.approved_by ? String(raw.approved_by) : null,
    rejectedReason: raw.rejected_reason ? String(raw.rejected_reason) : null,
    createdAt: String(raw.created_at),
    submittedAt: raw.submitted_at ? String(raw.submitted_at) : null,
    approvedAt: raw.approved_at ? String(raw.approved_at) : null,
    completedAt: raw.completed_at ? String(raw.completed_at) : null,
    summary: {
      totalLines: Number(summary.total_lines ?? 0),
      matchCount: Number(summary.match_count ?? 0),
      excessCount: Number(summary.excess_count ?? 0),
      lackCount: Number(summary.lack_count ?? 0),
      pendingCount: Number(summary.pending_count ?? 0),
    },
    items: ((raw.items ?? []) as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.id),
      skuId: String(item.sku_id),
      sku: String(item.sku),
      name: String(item.name),
      brandName: item.brand_name == null ? null : String(item.brand_name),
      systemQty: Number(item.system_qty),
      actualQty: item.actual_qty === null ? null : Number(item.actual_qty),
      difference: item.difference === null ? null : Number(item.difference),
      lineStatus: item.line_status as StockCountSession["items"][number]["lineStatus"],
    })),
  };
}

async function withBrandNames(session: StockCountSession): Promise<StockCountSession> {
  if (session.items.length === 0) return session;
  const supabase = await createServerSupabase();
  const skuIds = session.items.map((item) => item.skuId);
  const { data, error } = await supabase
    .from("pos_skus")
    .select("id, brands(name)")
    .in("id", skuIds);
  if (error || !data) return session;

  const brandBySku = new Map<string, string | null>();
  for (const row of data as Array<{
    id: string;
    brands?: { name: string } | { name: string }[] | null;
  }>) {
    const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands;
    brandBySku.set(row.id, brand?.name ?? null);
  }

  return {
    ...session,
    items: session.items.map((item) => ({
      ...item,
      brandName: brandBySku.get(item.skuId) ?? item.brandName ?? null,
    })),
  };
}

export async function listStockCounts(limit = 10, offset = 0) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_stock_counts", { p_limit: limit, p_offset: offset });
  if (error) throw new Error(error.message);
  const payload = data as {
    items: Array<Record<string, unknown>>;
    total: number;
    limit: number;
    offset: number;
  };
  return {
    items: payload.items.map((row) => ({
      id: String(row.id),
      countNo: String(row.count_no),
      warehouse: String(row.warehouse),
      scopeType: String(row.scope_type) as StockCountListRow["scopeType"],
      scopeValue: row.scope_value ? String(row.scope_value) : null,
      status: row.status as StockCountListRow["status"],
      actorEmail: String(row.actor_email),
      createdAt: String(row.created_at),
      completedAt: row.completed_at ? String(row.completed_at) : null,
    })),
    total: payload.total,
    limit: payload.limit,
    offset: payload.offset,
  };
}

export async function getStockCount(id: string): Promise<StockCountSession> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_stock_count", { p_id: id });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Không tìm thấy phiên kiểm kê.");
  return withBrandNames(mapSession(data as Record<string, unknown>));
}

export async function createStockCount(input: {
  warehouse?: string;
  scopeType: "ALL" | "CATEGORY";
  scopeValue?: string | null;
  note?: string;
}) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_create_stock_count", {
    p_warehouse: input.warehouse ?? "MAIN",
    p_scope_type: input.scopeType,
    p_scope_value: input.scopeValue ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  revalidateCount();
  return withBrandNames(mapSession(data as Record<string, unknown>));
}

export async function updateStockCountItem(countId: string, skuId: string, actualQty: number) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_update_stock_count_item", {
    p_count_id: countId,
    p_sku_id: skuId,
    p_actual_qty: actualQty,
  });
  if (error) throw new Error(error.message);
  revalidateCount();
  return withBrandNames(mapSession(data as Record<string, unknown>));
}

export async function submitStockCount(countId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_submit_stock_count", { p_count_id: countId });
  if (error) throw new Error(error.message);
  revalidateCount();
  return withBrandNames(mapSession(data as Record<string, unknown>));
}

export async function approveStockCount(countId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_approve_stock_count", { p_count_id: countId });
  if (error) throw new Error(error.message);
  revalidateCount();
  revalidatePath("/inventory/history");
  return withBrandNames(mapSession(data as Record<string, unknown>));
}

export async function rejectStockCount(countId: string, reason: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_reject_stock_count", {
    p_count_id: countId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidateCount();
  return withBrandNames(mapSession(data as Record<string, unknown>));
}
