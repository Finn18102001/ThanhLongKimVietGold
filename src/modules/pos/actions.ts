"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";

export async function completeSale(input: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  note?: string;
  idempotencyKey?: string;
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
  });
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  revalidatePath("/customers");
  return data as {
    ok: boolean;
    invoice_no: string;
    sale_no: string;
    total_dong: number;
    status: string;
  };
}
