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
  const { data, error } = await supabase.rpc("pos_receive_purchase", {
    p_idempotency_key: crypto.randomUUID(),
    p_supplier_name: String(formData.get("supplier_name") ?? "").trim(),
    p_reason: String(formData.get("reason") ?? "").trim(),
    p_items: [
      {
        sku_id: String(formData.get("sku_id") ?? ""),
        expected_qty: Number(formData.get("expected_qty") ?? 0),
        received_qty: receivedQty,
      },
    ],
  });
  if (error) {
    throw new Error(error.message);
  }
  revalidateInventory();
  return data as { ok: boolean; receipt_no: string; receipt_id: string };
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
