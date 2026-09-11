"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { getDepositSaleBundle } from "./query";
import type { DepositActionResult, DepositDocPayload, DepositSaleBundle } from "./types";

function revalidateDeposit() {
  revalidatePath("/pos");
  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/customers");
}

function fail(message: string): DepositActionResult {
  return { ok: false, message };
}

function ok(bundle: DepositSaleBundle): DepositActionResult {
  return { ok: true, bundle };
}

async function loadBundle(saleId: string): Promise<DepositActionResult> {
  try {
    const bundle = await getDepositSaleBundle(saleId);
    if (!bundle) return fail("Không tìm thấy đơn đặt cọc.");
    return ok(bundle);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Không tải được đơn đặt cọc.");
  }
}

export async function fetchDepositSale(saleId: string): Promise<DepositActionResult> {
  return loadBundle(saleId);
}

export async function saveDepositDocPayload(input: {
  saleId: string;
  payload: DepositDocPayload;
}): Promise<DepositActionResult> {
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("pos_save_deposit_doc_payload", {
      p_sale_id: input.saleId,
      p_payload: input.payload,
    });
    if (error) return fail(error.message);
    revalidateDeposit();
    return loadBundle(input.saleId);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Không lưu được thông tin bổ sung.");
  }
}

export async function confirmDepositAgreement(input: {
  saleId: string;
  deliveryPlace?: string;
  payload?: DepositDocPayload;
  idempotencyKey?: string;
}): Promise<DepositActionResult> {
  try {
    const supabase = await createServerSupabase();
    if (input.payload) {
      const { error: saveError } = await supabase.rpc("pos_save_deposit_doc_payload", {
        p_sale_id: input.saleId,
        p_payload: input.payload,
      });
      if (saveError) return fail(saveError.message);
    }
    const { error } = await supabase.rpc("pos_confirm_deposit_agreement", {
      p_sale_id: input.saleId,
      p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
      p_delivery_place: input.deliveryPlace || null,
    });
    if (error) return fail(error.message);
    const { error: slipError } = await supabase.rpc("pos_issue_deposit_slip", {
      p_sale_id: input.saleId,
      p_idempotency_key: `${input.idempotencyKey || crypto.randomUUID()}:slip`,
    });
    if (slipError) return fail(slipError.message);
    revalidateDeposit();
    return loadBundle(input.saleId);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Không xác nhận được thỏa thuận.");
  }
}

export async function issueDepositSlip(input: {
  saleId: string;
  idempotencyKey?: string;
}): Promise<DepositActionResult> {
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("pos_issue_deposit_slip", {
      p_sale_id: input.saleId,
      p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    });
    if (error) return fail(error.message);
    revalidateDeposit();
    return loadBundle(input.saleId);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Không lập được phiếu đặt cọc.");
  }
}

export async function prepareDepositHandover(input: {
  saleId: string;
  idempotencyKey?: string;
}): Promise<DepositActionResult> {
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("pos_prepare_deposit_delivery", {
      p_sale_id: input.saleId,
      p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    });
    if (error) return fail(error.message);
    revalidateDeposit();
    return loadBundle(input.saleId);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Không lập được biên bản giao nhận.");
  }
}

export async function confirmDepositHandover(input: {
  saleId: string;
  operatorStaffId?: string | null;
  idempotencyKey?: string;
}): Promise<DepositActionResult> {
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("pos_fulfill_deposit", {
      p_sale_id: input.saleId,
      p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
      p_operator_staff_id: input.operatorStaffId || null,
    });
    if (error) return fail(error.message);
    revalidateDeposit();
    return loadBundle(input.saleId);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Không xác nhận giao nhận được.");
  }
}
