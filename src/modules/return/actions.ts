"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import type { ReturnInvoiceLookup } from "./types";

function mapInvoice(raw: Record<string, unknown>): ReturnInvoiceLookup {
  return {
    invoiceId: String(raw.invoice_id),
    invoiceNo: String(raw.invoice_no),
    issuedAt: String(raw.issued_at),
    totalDong: Number(raw.total_dong),
    customerName: String(raw.customer_name),
    customerPhone: String(raw.customer_phone),
    customerNo: raw.customer_no ? String(raw.customer_no) : null,
    isWalkIn: Boolean(raw.is_walk_in),
    items: ((raw.items ?? []) as Array<Record<string, unknown>>).map((item) => {
      const soldQty = Number(item.sold_qty);
      const returnedQty = Number(item.returned_qty);
      return {
        saleItemId: String(item.sale_item_id),
        skuId: String(item.sku_id),
        sku: String(item.sku),
        name: String(item.name),
        soldQty,
        returnedQty,
        availableQty: soldQty - returnedQty,
        unitPriceDong: Number(item.unit_price_dong),
        weightChi: Number(item.weight_chi),
      };
    }),
  };
}

export async function lookupReturnInvoice(query: string): Promise<ReturnInvoiceLookup | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_return_invoice", { p_query: query.trim() });
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapInvoice(data as Record<string, unknown>);
}

export async function completeReturn(input: {
  invoiceNo: string;
  reason: string;
  itemCondition: string;
  refundMethod: "CASH" | "TRANSFER" | "CARD";
  note?: string;
  idempotencyKey: string;
  items: Array<{ sale_item_id: string; quantity: number }>;
}) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_complete_return", {
    p_idempotency_key: input.idempotencyKey,
    p_invoice_no: input.invoiceNo,
    p_reason: input.reason,
    p_item_condition: input.itemCondition,
    p_refund_method: input.refundMethod,
    p_note: input.note ?? null,
    p_items: input.items,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/returns");
  revalidatePath("/inventory");
  revalidatePath("/inventory/history");
  revalidatePath("/audit");
  revalidatePath("/reports");
  return data as {
    ok: boolean;
    return_no: string;
    total_dong: number;
    invoice_no: string;
  };
}
