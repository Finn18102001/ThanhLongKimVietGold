"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { getDepositSaleBundle } from "./query";
import type { DepositDocPayload, DepositSaleBundle } from "./types";

function revalidateDeposit() {
  revalidatePath("/pos");
  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/customers");
}

export async function fetchDepositSale(saleId: string): Promise<DepositSaleBundle> {
  const bundle = await getDepositSaleBundle(saleId);
  if (!bundle) throw new Error("Không tìm thấy đơn đặt cọc.");
  return bundle;
}

export async function saveDepositDocPayload(input: {
  saleId: string;
  payload: DepositDocPayload;
}): Promise<DepositSaleBundle> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_save_deposit_doc_payload", {
    p_sale_id: input.saleId,
    p_payload: input.payload,
  });
  if (error) throw new Error(error.message);
  revalidateDeposit();
  return fetchDepositSale(input.saleId);
}

export async function confirmDepositAgreement(input: {
  saleId: string;
  deliveryPlace?: string;
  payload?: DepositDocPayload;
  idempotencyKey?: string;
}): Promise<DepositSaleBundle> {
  const supabase = await createServerSupabase();
  if (input.payload) {
    const { error: saveError } = await supabase.rpc("pos_save_deposit_doc_payload", {
      p_sale_id: input.saleId,
      p_payload: input.payload,
    });
    if (saveError) throw new Error(saveError.message);
  }
  const { error } = await supabase.rpc("pos_confirm_deposit_agreement", {
    p_sale_id: input.saleId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    p_delivery_place: input.deliveryPlace || null,
  });
  if (error) throw new Error(error.message);
  const { error: slipError } = await supabase.rpc("pos_issue_deposit_slip", {
    p_sale_id: input.saleId,
    p_idempotency_key: `${input.idempotencyKey || crypto.randomUUID()}:slip`,
  });
  if (slipError) throw new Error(slipError.message);
  revalidateDeposit();
  return fetchDepositSale(input.saleId);
}

export async function issueDepositSlip(input: {
  saleId: string;
  idempotencyKey?: string;
}): Promise<DepositSaleBundle> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_issue_deposit_slip", {
    p_sale_id: input.saleId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidateDeposit();
  return fetchDepositSale(input.saleId);
}

export async function prepareDepositHandover(input: {
  saleId: string;
  idempotencyKey?: string;
}): Promise<DepositSaleBundle> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_prepare_deposit_delivery", {
    p_sale_id: input.saleId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidateDeposit();
  return fetchDepositSale(input.saleId);
}

export async function confirmDepositHandover(input: {
  saleId: string;
  operatorStaffId?: string | null;
  idempotencyKey?: string;
}): Promise<DepositSaleBundle> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_fulfill_deposit", {
    p_sale_id: input.saleId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    p_operator_staff_id: input.operatorStaffId || null,
  });
  if (error) throw new Error(error.message);
  revalidateDeposit();
  return fetchDepositSale(input.saleId);
}
