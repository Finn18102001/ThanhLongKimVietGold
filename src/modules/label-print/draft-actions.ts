"use server";

import { revalidatePath } from "next/cache";
import { assertStaffMutate } from "@/shared/auth/assert";
import { runAction, type ActionResult } from "@/shared/lib/action-result";
import { createServerSupabase } from "@/shared/supabase/server";
import type {
  CreateLabelDraftInput,
  LabelDraftDetail,
  LabelDraftSummary,
} from "./draft-types";

function revalidateDraftPaths() {
  revalidatePath("/label-print");
  revalidatePath("/inventory/receive");
}

function mapSummary(row: Record<string, unknown>): LabelDraftSummary {
  return {
    id: String(row.id),
    codeMode: String(row.code_mode) as LabelDraftSummary["codeMode"],
    printableCode: String(row.printable_code ?? ""),
    productName: String(row.product_name ?? ""),
    brandText: String(row.brand_text ?? ""),
    categoryText: String(row.category_text ?? ""),
    costPriceDong: row.cost_price_dong == null ? null : Number(row.cost_price_dong),
    sellPriceDong: row.sell_price_dong == null ? null : Number(row.sell_price_dong),
    weightChi: row.weight_chi == null ? null : Number(row.weight_chi),
    status: String(row.status) as LabelDraftSummary["status"],
    printedAt: row.printed_at == null ? null : String(row.printed_at),
    createdAt: String(row.created_at ?? ""),
    createdBy: String(row.created_by ?? ""),
    testMarker: row.test_marker == null ? null : String(row.test_marker),
  };
}

export async function createLabelDraftAction(
  input: CreateLabelDraftInput,
): Promise<ActionResult<{ id: string; printableCode: string; reservedMsp: string | null }>> {
  return runAction(async () => {
    await assertStaffMutate();
    const supabase = await createServerSupabase();
    const payload = {
      code_mode: input.codeMode,
      type_code: input.typeCode,
      product_number: input.productNumber ?? "",
      product_name: input.productName,
      brand_text: input.brandText,
      category_text: input.categoryText,
      product_type_text: input.productTypeText ?? "",
      price_row_id: input.priceRowId ?? "",
      price_note: input.priceNote ?? "",
      cost_price_dong: input.costPriceDong == null ? "" : String(input.costPriceDong),
      sell_price_dong: input.sellPriceDong == null ? "" : String(input.sellPriceDong),
      labor_fee_dong: input.laborFeeDong == null ? "" : String(input.laborFeeDong),
      weight_chi: input.weightChi == null ? "" : String(input.weightChi),
      gold_age_text: input.goldAgeText ?? "",
      note: input.note ?? "",
    };
    const { data, error } = await supabase.rpc("pos_create_label_draft", {
      p_payload: payload,
      p_test_marker: input.testMarker ?? null,
    });
    if (error) throw new Error(error.message);
    const row = data as {
      id: string;
      printable_code: string;
      reserved_msp?: string | null;
    };
    revalidateDraftPaths();
    return {
      id: row.id,
      printableCode: row.printable_code,
      reservedMsp: row.reserved_msp ?? null,
    };
  }, "Không tạo được draft tem.");
}

export async function recordLabelDraftPrintAction(input: {
  draftId: string;
  printQty?: number;
}): Promise<ActionResult<{ logId: string; printableCode: string; actionType: string }>> {
  return runAction(async () => {
    await assertStaffMutate();
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_record_label_draft_print", {
      p_draft_id: input.draftId,
      p_print_qty: input.printQty ?? 1,
      p_stock_size: "90x14",
      p_payload: {},
    });
    if (error) throw new Error(error.message);
    const row = data as {
      log_id: string;
      printable_code: string;
      action_type: string;
    };
    revalidateDraftPaths();
    return {
      logId: row.log_id,
      printableCode: row.printable_code,
      actionType: row.action_type,
    };
  }, "Không ghi nhận in draft.");
}

export async function listPendingLabelDraftsAction(
  query = "",
): Promise<ActionResult<LabelDraftSummary[]>> {
  return runAction(async () => {
    await assertStaffMutate();
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_list_pending_label_drafts", {
      p_query: query || null,
      p_limit: 50,
    });
    if (error) throw new Error(error.message);
    const rows = ((data as { rows?: Record<string, unknown>[] } | null)?.rows ?? []).map(
      mapSummary,
    );
    return rows;
  }, "Không tải được danh sách draft chờ nhập.");
}

export async function getLabelDraftAction(
  draftId: string,
): Promise<ActionResult<LabelDraftDetail>> {
  return runAction(async () => {
    await assertStaffMutate();
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("pos_label_drafts")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Draft không tồn tại.");
    const row = data as Record<string, unknown>;
    const summary = mapSummary(row);
    return {
      ...summary,
      typeCode: String(row.type_code ?? ""),
      productNumber: row.product_number == null ? null : String(row.product_number),
      reservedMsp: row.reserved_msp == null ? null : String(row.reserved_msp),
      reservedSerialNo: row.reserved_serial_no == null ? null : String(row.reserved_serial_no),
      productTypeText: row.product_type_text == null ? null : String(row.product_type_text),
      priceRowId: row.price_row_id == null ? null : String(row.price_row_id),
      priceNote: row.price_note == null ? null : String(row.price_note),
      laborFeeDong: row.labor_fee_dong == null ? null : Number(row.labor_fee_dong),
      goldAgeText: row.gold_age_text == null ? null : String(row.gold_age_text),
      stoneWeightChi: row.stone_weight_chi == null ? null : Number(row.stone_weight_chi),
      stoneQuantity: row.stone_quantity == null ? null : Number(row.stone_quantity),
      stoneUnitPriceDong:
        row.stone_unit_price_dong == null ? null : Number(row.stone_unit_price_dong),
      note: row.note == null ? null : String(row.note),
      snapshotJson: (row.snapshot_json as Record<string, unknown>) ?? {},
    };
  }, "Không tải được draft.");
}
