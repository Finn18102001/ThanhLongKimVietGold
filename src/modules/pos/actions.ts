"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { mapHeldOrderDetail, mapHeldOrderList } from "./heldOrderMap";
import type { HeldOrderDetail, HeldOrderListResult } from "./types";

type SaleResult = {
  ok: boolean;
  invoice_no: string;
  sale_no: string;
  total_dong: number;
  paid_dong: number;
  remaining_dong: number;
  payment_status: string;
  due_date: string | null;
  status: string;
};

export async function completeSale(input: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  note?: string;
  idempotencyKey?: string;
  paidDong?: number | null;
  dueDate?: string | null;
  items: Array<{ sku_id: string; quantity: number }>;
}) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_complete_sale", {
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    p_customer_id: input.customerId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_payment_method: input.paymentMethod,
    p_note: input.note || null,
    p_items: input.items,
    p_paid_dong: input.paidDong ?? null,
    p_due_date: input.dueDate || null,
  });
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  revalidatePath("/customers");
  return data as SaleResult;
}

export async function saveHeldOrder(input: {
  customerId: string;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  note?: string;
  heldOrderId?: string | null;
  items: Array<{ sku_id: string; quantity: number }>;
}): Promise<HeldOrderDetail> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_save_held_order", {
    p_items: input.items,
    p_customer_id: input.customerId,
    p_payment_method: input.paymentMethod,
    p_note: input.note || null,
    p_held_order_id: input.heldOrderId || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/pos");
  return mapHeldOrderDetail(data);
}

export async function fetchHeldOrders(): Promise<HeldOrderListResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_held_orders");
  if (error) throw new Error(error.message);
  return mapHeldOrderList(data);
}

export async function getHeldOrder(id: string): Promise<HeldOrderDetail> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_held_order", { p_id: id });
  if (error) throw new Error(error.message);
  return mapHeldOrderDetail(data);
}

export async function cancelHeldOrder(id: string): Promise<{ ok: boolean; holdNo: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_cancel_held_order", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath("/pos");
  const payload = data as { ok?: boolean; hold_no?: string };
  return { ok: payload.ok !== false, holdNo: payload.hold_no ?? "" };
}

export async function completeHeldSale(input: {
  heldOrderId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  note?: string;
  idempotencyKey?: string;
  paidDong?: number | null;
  dueDate?: string | null;
  items: Array<{ sku_id: string; quantity: number }>;
}): Promise<SaleResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_complete_held_sale", {
    p_held_order_id: input.heldOrderId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    p_customer_id: input.customerId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_payment_method: input.paymentMethod,
    p_note: input.note || null,
    p_items: input.items,
    p_paid_dong: input.paidDong ?? null,
    p_due_date: input.dueDate || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  revalidatePath("/customers");
  return data as SaleResult;
}

/** Fresh stock only — never cache. Call on POS tab focus / enter. */
export async function refreshPosStock(skuIds?: string[]): Promise<Record<string, number>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_sku_stock", {
    p_sku_ids: skuIds?.length ? skuIds : null,
  });
  if (error) throw new Error(error.message);
  const items = (
    data as { items?: Array<{ sku_id: string; quantity: number | string }> } | null
  )?.items;
  const map: Record<string, number> = {};
  for (const row of items ?? []) {
    map[row.sku_id] = Number(row.quantity ?? 0);
  }
  return map;
}
