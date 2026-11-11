"use server";

import { revalidatePath } from "next/cache";
import { assertAdminWrite } from "@/shared/auth/assert";
import {
  actionFail,
  actionFailFromSupabase,
  actionOk,
  formatActionError,
  type ActionResult,
} from "@/shared/lib/action-result";
import { createServerSupabase } from "@/shared/supabase/server";
import { getLabelSku } from "./query";
import {
  GOLD_AGE_PATTERN,
  type LabelReceiveInput,
  type LabelReceiveResult,
} from "./types";

const FALLBACK = "Không nhập được hàng. Kho chưa thay đổi.";

function validate(input: LabelReceiveInput): string | null {
  if (!input.idempotencyKey.trim()) return "Thiếu mã chống trùng. Tải lại trang rồi thử lại.";
  if (!input.name.trim() || !input.brandId) return "Tên sản phẩm và thương hiệu là bắt buộc.";
  if (!/^[A-Z0-9]{2,12}$/.test(input.skuPrefix.trim().toUpperCase())) {
    return "Mã đầu gồm 2 đến 12 ký tự chữ hoặc số. Số phía sau do hệ thống tự tăng.";
  }
  if (!Number.isFinite(input.weightChi) || input.weightChi < 0) {
    return "Định lượng (chỉ) không hợp lệ.";
  }
  const goldAge = input.goldAge.trim();
  if (goldAge) {
    if (!GOLD_AGE_PATTERN.test(goldAge)) return "Tuổi vàng là số, tối đa 3 chữ số thập phân.";
    const value = Number(goldAge);
    if (!(value > 0 && value <= 1000)) return "Tuổi vàng phải lớn hơn 0 và không quá 1000.";
  }
  if (!Number.isInteger(input.receivedQty) || input.receivedQty <= 0) {
    return "Số nhận thực tế phải là số nguyên > 0.";
  }
  if (!Number.isInteger(input.expectedQty) || input.expectedQty < 0) {
    return "Số dự kiến phải là số nguyên không âm.";
  }
  if (!Number.isInteger(input.costPriceDong) || input.costPriceDong < 0) {
    return "Giá vốn phải là số nguyên VND không âm.";
  }
  if (!input.supplierName.trim()) return "Nhà cung cấp là bắt buộc.";
  if (input.paymentMethod !== "CASH" && input.paymentMethod !== "TRANSFER") {
    return "Hình thức thanh toán chỉ nhận Tiền mặt hoặc Chuyển khoản.";
  }
  return null;
}

export async function receiveLabelOrderPurchase(
  input: LabelReceiveInput,
): Promise<ActionResult<LabelReceiveResult>> {
  try {
    await assertAdminWrite();
  } catch (err) {
    return actionFail(formatActionError(err));
  }

  const invalid = validate(input);
  if (invalid) return actionFail(invalid);

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_receive_label_order_purchase", {
      p_idempotency_key: input.idempotencyKey.trim(),
      p_supplier_name: input.supplierName.trim(),
      p_reason: input.reason.trim() || "Nhập hàng",
      p_item: {
        sku_id: null,
        expected_qty: input.expectedQty,
        received_qty: input.receivedQty,
        cost_price_dong: input.costPriceDong,
        weight_chi: input.weightChi,
        order_product: {
          name: input.name.trim(),
          brand_id: input.brandId,
          category_id: input.categoryId || null,
          price_row_id: input.priceRowId || null,
          price_note: input.priceNote.trim(),
          sku_prefix: input.skuPrefix.trim().toUpperCase(),
          visible: input.visible,
          weight_chi: input.weightChi,
          gold_age: input.goldAge.trim() || null,
        },
      },
      p_payment_method: input.paymentMethod,
      p_note: null,
    });
    if (error) return actionFailFromSupabase(error, FALLBACK);

    const payload = (data ?? {}) as {
      receipt_no?: string;
      sku_id?: string;
      sku_code?: string;
      replayed?: boolean;
    };
    if (!payload.sku_id) return actionFail("Không nhận được mã hàng vừa nhập.", FALLBACK);

    revalidatePath("/label-print");
    revalidatePath("/inventory");
    revalidatePath("/inventory/receive");
    revalidatePath("/inventory/history");
    revalidatePath("/gold-management");
    revalidatePath("/cashflow");
    revalidatePath("/pos");
    revalidatePath("/");

    let sku = null;
    try {
      sku = await getLabelSku(payload.sku_id);
    } catch {
      // Stock is already committed; the page refresh will still list the SKU.
    }

    return actionOk({
      receiptNo: String(payload.receipt_no ?? ""),
      skuId: payload.sku_id,
      skuCode: String(payload.sku_code ?? sku?.sku ?? ""),
      replayed: Boolean(payload.replayed),
      sku,
    });
  } catch (err) {
    return actionFail(formatActionError(err, FALLBACK), FALLBACK);
  }
}
