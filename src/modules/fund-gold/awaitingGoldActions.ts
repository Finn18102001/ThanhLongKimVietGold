"use server";

import { revalidatePath } from "next/cache";
import {
  actionFail,
  actionOk,
  formatActionError,
  type ActionResult,
} from "@/shared/lib/action-result";
import { ROUTES } from "@/shared/navigation/routes";
import { createServerSupabase } from "@/shared/supabase/server";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import { assertStaffMutate } from "@/shared/auth/assert";
import type { SaleAwaitingGoldList, SaleAwaitingGoldRow } from "./types";

async function requireFlagOn() {
  if (!(await isEmployeeFundEnabled())) {
    throw new Error("Feature Flag Quỹ nhân viên đang TẮT.");
  }
}

function mapRow(raw: Record<string, unknown>): SaleAwaitingGoldRow {
  return {
    saleId: String(raw.saleId ?? ""),
    saleNo: String(raw.saleNo ?? ""),
    invoiceNo: raw.invoiceNo ? String(raw.invoiceNo) : null,
    totalDong: Number(raw.totalDong ?? 0),
    paidDong: Number(raw.paidDong ?? 0),
    paymentStatus: String(raw.paymentStatus ?? ""),
    fulfillmentStatus: String(raw.fulfillmentStatus ?? ""),
    createdAt: raw.createdAt ? String(raw.createdAt) : null,
    customerName: raw.customerName ? String(raw.customerName) : null,
    pendingYcCount: Number(raw.pendingYcCount ?? 0),
    confirmedYcCount: Number(raw.confirmedYcCount ?? 0),
    canConfirmGold: Boolean(raw.canConfirmGold),
  };
}

export async function listSalesAwaitingGold(): Promise<SaleAwaitingGoldList> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_sale_list_awaiting_gold", {
    p_limit: 50,
    p_offset: 0,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as { items?: unknown[]; total?: number };
  return {
    items: ((row.items ?? []) as Record<string, unknown>[]).map(mapRow),
    total: Number(row.total ?? 0),
  };
}

export async function refreshSalesAwaitingGold(): Promise<
  ActionResult<SaleAwaitingGoldList>
> {
  try {
    await requireFlagOn();
    return actionOk(await listSalesAwaitingGold());
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được đơn chờ trả vàng."));
  }
}

export async function confirmSaleGoldDelivery(
  saleId: string,
): Promise<
  ActionResult<{ invoiceNo: string; alreadyConfirmed: boolean; saleNo: string }>
> {
  try {
    await assertStaffMutate();
    await requireFlagOn();
    if (!saleId) return actionFail("Thiếu mã đơn bán.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_sale_confirm_gold", {
      p_sale_id: saleId,
    });
    if (error) return actionFail(error.message || "Không xác nhận trả vàng.");

    revalidatePath(ROUTES.pos);
    revalidatePath(ROUTES.inventory);
    revalidatePath(ROUTES.invoices);
    const row = (data ?? {}) as {
      invoiceNo?: string;
      saleNo?: string;
      alreadyConfirmed?: boolean;
    };
    return actionOk({
      invoiceNo: String(row.invoiceNo ?? ""),
      saleNo: String(row.saleNo ?? ""),
      alreadyConfirmed: Boolean(row.alreadyConfirmed),
    });
  } catch (err) {
    return actionFail(formatActionError(err, "Không xác nhận trả vàng."));
  }
}
