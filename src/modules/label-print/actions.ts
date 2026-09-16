"use server";

import { revalidatePath } from "next/cache";
import { assertStaffMutate } from "@/shared/auth/assert";
import { createServerSupabase } from "@/shared/supabase/server";
import type { LabelPiece, LabelPrintAction, LabelStockSize } from "./types";

function revalidateLabelPrint() {
  revalidatePath("/label-print");
}

export async function listPiecesForSkuAction(skuId: string): Promise<LabelPiece[]> {
  await assertStaffMutate();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_label_pieces")
    .select("id, msp, barcode, sku_id, created_at, created_by")
    .eq("sku_id", skuId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    msp: row.msp,
    barcode: row.barcode,
    skuId: row.sku_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

export async function mintLabelPiece(skuId: string): Promise<{
  id: string;
  msp: string;
  barcode: string;
  skuId: string;
}> {
  await assertStaffMutate();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_mint_label_piece", {
    p_sku_id: skuId,
  });
  if (error) throw new Error(error.message);
  const payload = data as { id: string; msp: string; barcode: string; sku_id: string };
  revalidateLabelPrint();
  return {
    id: payload.id,
    msp: payload.msp,
    barcode: payload.barcode,
    skuId: payload.sku_id,
  };
}

export async function recordLabelPrint(input: {
  pieceId: string;
  printQty: number;
  stockSize: LabelStockSize;
  actionType: LabelPrintAction;
  companyName: string;
  addressLine: string;
  kltChi: number;
  klvChi: number;
  laborFeeDong: number;
  priceDong: number;
}): Promise<{ logId: string; msp: string; barcode: string; actorEmail: string }> {
  await assertStaffMutate();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_record_label_print", {
    p_piece_id: input.pieceId,
    p_print_qty: input.printQty,
    p_stock_size: input.stockSize,
    p_action_type: input.actionType,
    p_company_name: input.companyName,
    p_address_line: input.addressLine,
    p_klt_chi: input.kltChi,
    p_klv_chi: input.klvChi,
    p_labor_fee_dong: input.laborFeeDong,
    p_price_dong: input.priceDong,
  });
  if (error) throw new Error(error.message);
  const payload = data as {
    log_id: string;
    msp: string;
    barcode: string;
    actor_email?: string;
  };
  revalidateLabelPrint();
  return {
    logId: payload.log_id,
    msp: payload.msp,
    barcode: payload.barcode,
    actorEmail: payload.actor_email ?? "",
  };
}
