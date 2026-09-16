"use server";

import { revalidatePath } from "next/cache";
import { assertStaffMutate } from "@/shared/auth/assert";
import { createServerSupabase } from "@/shared/supabase/server";
import { listPrintHistoryPage, pieceHasLabelPrint } from "./query";
import type {
  LabelHistoryPage,
  LabelHistoryQuery,
  LabelPiece,
  LabelPrintAction,
  LabelStockSize,
} from "./types";

export async function fetchPrintHistoryPage(
  query: Partial<LabelHistoryQuery> = {},
): Promise<LabelHistoryPage> {
  return listPrintHistoryPage(query);
}

export async function pieceHasLabelPrintAction(pieceId: string): Promise<boolean> {
  return pieceHasLabelPrint(pieceId);
}

function revalidateLabelPrint() {
  revalidatePath("/label-print");
}

function mapPiece(row: {
  id: string;
  msp: string;
  barcode: string;
  type_code?: string | null;
  serial_no?: string | null;
  sku_id: string;
  created_at: string;
  created_by: string;
}): LabelPiece {
  return {
    id: row.id,
    msp: row.msp,
    barcode: row.barcode,
    typeCode: String(row.type_code ?? ""),
    serialNo: String(row.serial_no ?? row.msp),
    skuId: row.sku_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export async function listPiecesForSkuAction(skuId: string): Promise<LabelPiece[]> {
  await assertStaffMutate();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_label_pieces")
    .select("id, msp, barcode, type_code, serial_no, sku_id, created_at, created_by")
    .eq("sku_id", skuId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPiece(row));
}

export async function mintLabelPiece(
  skuId: string,
  typeCode = "",
): Promise<{
  id: string;
  msp: string;
  barcode: string;
  typeCode: string;
  serialNo: string;
  skuId: string;
}> {
  await assertStaffMutate();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_mint_label_piece", {
    p_sku_id: skuId,
    p_type_code: typeCode.trim(),
  });
  if (error) throw new Error(error.message);
  const payload = data as {
    id: string;
    msp: string;
    barcode: string;
    sku_id: string;
    type_code?: string;
    serial_no?: string;
  };
  revalidateLabelPrint();
  return {
    id: payload.id,
    msp: payload.msp,
    barcode: payload.barcode,
    typeCode: String(payload.type_code ?? ""),
    serialNo: String(payload.serial_no ?? ""),
    skuId: payload.sku_id,
  };
}

/** Update editable product-type prefix; serial stays immutable. Checks MSP uniqueness. */
export async function setLabelPieceTypeCode(
  pieceId: string,
  typeCode: string,
): Promise<{
  id: string;
  msp: string;
  barcode: string;
  typeCode: string;
  serialNo: string;
}> {
  await assertStaffMutate();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_set_label_piece_type_code", {
    p_piece_id: pieceId,
    p_type_code: typeCode,
  });
  if (error) throw new Error(error.message);
  const payload = data as {
    id: string;
    msp: string;
    barcode: string;
    type_code: string;
    serial_no: string;
  };
  revalidateLabelPrint();
  return {
    id: payload.id,
    msp: payload.msp,
    barcode: payload.barcode,
    typeCode: payload.type_code,
    serialNo: payload.serial_no,
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
