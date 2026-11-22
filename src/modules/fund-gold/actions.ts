"use server";

import { revalidatePath } from "next/cache";
import { assertAdminWrite, assertStaffMutate } from "@/shared/auth/assert";
import {
  actionFail,
  actionOk,
  formatActionError,
  type ActionResult,
} from "@/shared/lib/action-result";
import { ROUTES } from "@/shared/navigation/routes";
import { createServerSupabase } from "@/shared/supabase/server";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import {
  getEmployeeGoldTransfer,
  listEmployeeGoldAccounts,
  listEmployeeGoldCounts,
  listEmployeeGoldLedger,
  listEmployeeGoldStock,
  listEmployeeGoldTransfers,
  searchGoldSkus,
} from "./query";
import type {
  EmployeeGoldAccount,
  EmployeeGoldCountRow,
  EmployeeGoldLedgerPage,
  EmployeeGoldStockRow,
  GoldSkuOption,
  GoldTransferListPage,
  GoldTransferRow,
} from "./types";

function idemKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function requireFlagOn() {
  if (!(await isEmployeeFundEnabled())) {
    throw new Error("Feature Flag Quỹ nhân viên đang TẮT.");
  }
}

export async function refreshEmployeeGoldAccounts(): Promise<
  ActionResult<EmployeeGoldAccount[]>
> {
  try {
    await requireFlagOn();
    return actionOk(await listEmployeeGoldAccounts());
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được danh sách Quỹ vàng."));
  }
}

export async function refreshEmployeeGoldStock(
  accountId?: string | null,
): Promise<ActionResult<EmployeeGoldStockRow[]>> {
  try {
    await requireFlagOn();
    return actionOk(await listEmployeeGoldStock(accountId));
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được tồn Quỹ vàng."));
  }
}

export async function refreshEmployeeGoldLedger(input?: {
  accountId?: string | null;
}): Promise<ActionResult<EmployeeGoldLedgerPage>> {
  try {
    await requireFlagOn();
    return actionOk(await listEmployeeGoldLedger(input));
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được sổ Quỹ vàng."));
  }
}

export async function refreshEmployeeGoldCounts(input?: {
  accountId?: string | null;
}): Promise<ActionResult<EmployeeGoldCountRow[]>> {
  try {
    await requireFlagOn();
    return actionOk(await listEmployeeGoldCounts(input));
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được lịch sử kiểm kê."));
  }
}

export async function searchGoldSkuOptions(
  query: string,
): Promise<ActionResult<GoldSkuOption[]>> {
  try {
    await requireFlagOn();
    return actionOk(await searchGoldSkus(query, 30));
  } catch (err) {
    return actionFail(formatActionError(err, "Không tìm được SKU."));
  }
}

export async function createStaffGoldAccount(input: {
  staffId: string;
  name?: string;
}): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    await assertAdminWrite();
    await requireFlagOn();
    if (!input.staffId) return actionFail("Chọn nhân viên.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_gold_create_staff_account", {
      p_staff_id: input.staffId,
      p_name: input.name?.trim() || null,
    });
    if (error) return actionFail(error.message || "Không tạo được tài khoản.");

    revalidatePath(ROUTES.fundGold);
    const row = (data ?? {}) as { id?: string; code?: string };
    return actionOk({ id: String(row.id), code: String(row.code ?? "") });
  } catch (err) {
    return actionFail(formatActionError(err, "Không tạo được tài khoản."));
  }
}

export async function adminCapitalGold(input: {
  skuId: string;
  direction: "IN" | "OUT";
  quantity: number;
  content: string;
  reason?: string;
}): Promise<ActionResult<{ ledgerId: string }>> {
  try {
    await assertAdminWrite();
    await requireFlagOn();
    const qty = Math.trunc(Number(input.quantity));
    if (!input.skuId) return actionFail("Chọn SKU.");
    if (!Number.isFinite(qty) || qty <= 0) return actionFail("Số lượng không hợp lệ.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_gold_admin_capital", {
      p_idempotency_key: idemKey("gcap"),
      p_sku_id: input.skuId,
      p_direction: input.direction,
      p_quantity: qty,
      p_content: input.content,
      p_reason: input.reason?.trim() || null,
    });
    if (error) return actionFail(error.message || "Không ghi nhận vốn Quỹ Admin.");

    revalidatePath(ROUTES.fundGold);
    return actionOk({ ledgerId: String((data as { ledgerId?: string })?.ledgerId ?? "") });
  } catch (err) {
    return actionFail(formatActionError(err, "Không ghi nhận vốn Quỹ Admin."));
  }
}

export async function adminAllocateGold(input: {
  staffAccountId: string;
  skuId: string;
  direction: "IN" | "OUT";
  quantity: number;
  content: string;
  reason?: string;
}): Promise<ActionResult<{ transferGroupId: string }>> {
  try {
    await assertAdminWrite();
    await requireFlagOn();
    const qty = Math.trunc(Number(input.quantity));
    if (!input.staffAccountId) return actionFail("Chọn tài khoản nhân viên.");
    if (!input.skuId) return actionFail("Chọn SKU.");
    if (!Number.isFinite(qty) || qty <= 0) return actionFail("Số lượng không hợp lệ.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_gold_admin_allocate", {
      p_idempotency_key: idemKey("galloc"),
      p_staff_account_id: input.staffAccountId,
      p_sku_id: input.skuId,
      p_direction: input.direction,
      p_quantity: qty,
      p_content: input.content,
      p_reason: input.reason?.trim() || null,
    });
    if (error) return actionFail(error.message || "Không phân bổ được.");

    revalidatePath(ROUTES.fundGold);
    return actionOk({
      transferGroupId: String((data as { transferGroupId?: string })?.transferGroupId ?? ""),
    });
  } catch (err) {
    return actionFail(formatActionError(err, "Không phân bổ được."));
  }
}

export async function refreshEmployeeGoldTransfers(): Promise<
  ActionResult<GoldTransferListPage>
> {
  try {
    await requireFlagOn();
    return actionOk(await listEmployeeGoldTransfers({ limit: 50 }));
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được danh sách CTCV."));
  }
}

export async function transferEmployeeGold(input: {
  fromAccountId: string;
  toAccountId: string;
  skuId: string;
  quantity: number;
  content: string;
}): Promise<ActionResult<{ id: string; code: string; transfer: GoldTransferRow | null }>> {
  try {
    await assertStaffMutate();
    await requireFlagOn();
    const qty = Math.trunc(Number(input.quantity));
    if (!input.fromAccountId || !input.toAccountId) {
      return actionFail("Chọn tài khoản gửi và nhận.");
    }
    if (!input.skuId) return actionFail("Chọn SKU.");
    if (!Number.isFinite(qty) || qty <= 0) return actionFail("Số lượng không hợp lệ.");
    if (!input.content.trim()) return actionFail("Nhập nội dung chuyển vàng.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_gold_transfer", {
      p_from_account_id: input.fromAccountId,
      p_to_account_id: input.toAccountId,
      p_sku_id: input.skuId,
      p_quantity: qty,
      p_content: input.content.trim(),
    });
    if (error) return actionFail(error.message || "Không chuyển được vàng.");

    revalidatePath(ROUTES.fundGold);
    const row = (data ?? {}) as { id?: string; code?: string };
    const id = String(row.id ?? "");
    let transfer: GoldTransferRow | null = null;
    if (id) {
      try {
        transfer = await getEmployeeGoldTransfer(id);
      } catch {
        transfer = null;
      }
    }
    return actionOk({ id, code: String(row.code ?? ""), transfer });
  } catch (err) {
    return actionFail(formatActionError(err, "Không chuyển được vàng."));
  }
}

export async function submitGoldCount(input: {
  accountId: string;
  note?: string;
  lines: { skuId: string; countedQty: number; note?: string }[];
}): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    await assertStaffMutate();
    await requireFlagOn();
    if (!input.accountId) return actionFail("Chọn tài khoản kiểm kê.");
    if (!input.lines.length) return actionFail("Nhập ít nhất một dòng kiểm kê.");

    const lines = input.lines.map((l) => ({
      skuId: l.skuId,
      countedQty: Math.trunc(Number(l.countedQty)),
      note: l.note?.trim() || null,
    }));
    if (lines.some((l) => !l.skuId || !Number.isFinite(l.countedQty) || l.countedQty < 0)) {
      return actionFail("Dòng kiểm kê không hợp lệ.");
    }

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_gold_submit_count", {
      p_account_id: input.accountId,
      p_note: input.note?.trim() || null,
      p_lines: lines,
    });
    if (error) return actionFail(error.message || "Không ghi được kiểm kê.");

    revalidatePath(ROUTES.fundGold);
    const row = (data ?? {}) as { id?: string; code?: string };
    return actionOk({ id: String(row.id), code: String(row.code ?? "") });
  } catch (err) {
    return actionFail(formatActionError(err, "Không ghi được kiểm kê."));
  }
}
