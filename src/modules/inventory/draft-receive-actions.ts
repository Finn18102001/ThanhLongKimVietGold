"use server";

import { revalidatePath } from "next/cache";
import { assertAdminWrite } from "@/shared/auth/assert";
import { runAction, type ActionResult } from "@/shared/lib/action-result";
import { createServerSupabase } from "@/shared/supabase/server";

export type ReceiveLabelDraftInput = {
  draftId: string;
  idempotencyKey: string;
  supplierName: string;
  reason: string;
  brandId: string;
  categoryId: string;
  costPriceDong: number;
  sellPriceDong: number | null;
  paymentMethod: "CASH" | "TRANSFER";
  note?: string;
  order: {
    name: string;
    priceRowId?: string | null;
    priceNote?: string;
    weightChi: number;
    skuPrefix: string;
    visible: boolean;
    productTypeId?: string | null;
    goldAge?: string | null;
  };
};

export async function receiveLabelDraftAction(
  input: ReceiveLabelDraftInput,
): Promise<
  ActionResult<{
    receiptId: string;
    skuCode: string | null;
    unitId: string | null;
    pieceId: string | null;
    printableCode: string;
    replayed: boolean;
    sellPriceAppliedToSku: boolean;
  }>
> {
  return runAction(async () => {
    await assertAdminWrite();
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_receive_label_draft", {
      p_draft_id: input.draftId,
      p_idempotency_key: input.idempotencyKey,
      p_supplier_name: input.supplierName,
      p_reason: input.reason,
      p_brand_id: input.brandId,
      p_category_id: input.categoryId,
      p_cost_price_dong: input.costPriceDong,
      p_sell_price_dong: input.sellPriceDong,
      p_payment_method: input.paymentMethod,
      p_note: input.note ?? null,
      p_order: {
        name: input.order.name,
        price_row_id: input.order.priceRowId ?? "",
        price_note: input.order.priceNote ?? "",
        weight_chi: String(input.order.weightChi),
        sku_prefix: input.order.skuPrefix,
        visible: input.order.visible,
        product_type_id: input.order.productTypeId ?? "",
        gold_age: input.order.goldAge ?? "",
      },
    });
    if (error) throw new Error(error.message);
    const row = data as {
      receipt_id?: string;
      sku_code?: string | null;
      unit_id?: string | null;
      piece_id?: string | null;
      printable_code?: string;
      replayed?: boolean;
      sell_price_applied_to_sku?: boolean;
    };
    revalidatePath("/inventory");
    revalidatePath("/inventory/receive");
    revalidatePath("/inventory/history");
    revalidatePath("/label-print");
    revalidatePath("/pos");
    revalidatePath("/invoices");
    return {
      receiptId: String(row.receipt_id ?? ""),
      skuCode: row.sku_code ?? null,
      unitId: row.unit_id ?? null,
      pieceId: row.piece_id ?? null,
      printableCode: String(row.printable_code ?? ""),
      replayed: Boolean(row.replayed),
      sellPriceAppliedToSku: Boolean(row.sell_price_applied_to_sku),
    };
  }, "Không nhập kho từ draft tem.");
}
