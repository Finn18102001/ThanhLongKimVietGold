"use server";

import { revalidatePath } from "next/cache";
import { assertAdminWrite } from "@/shared/auth/assert";
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
import {
  getCashTransfer,
  listCashRequests,
  listCashTransfers,
  listEmployeeCashAccounts,
  listEmployeeCashLedger,
} from "./query";
import type {
  CashRequestListPage,
  CashTransferListPage,
  CashTransferRow,
  EmployeeCashAccount,
  EmployeeCashLedgerPage,
} from "./types";

function idemKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function requireFlagOn() {
  if (!(await isEmployeeFundEnabled())) {
    throw new Error("Feature Flag Quỹ nhân viên đang TẮT.");
  }
}

export async function refreshEmployeeCashAccounts(): Promise<
  ActionResult<EmployeeCashAccount[]>
> {
  try {
    await requireFlagOn();
    return actionOk(await listEmployeeCashAccounts());
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được danh sách quỹ."));
  }
}

export async function refreshEmployeeCashLedger(input?: {
  accountId?: string | null;
}): Promise<ActionResult<EmployeeCashLedgerPage>> {
  try {
    await requireFlagOn();
    return actionOk(await listEmployeeCashLedger(input));
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được sổ quỹ."));
  }
}

export async function createStaffCashAccount(input: {
  staffId: string;
  name?: string;
}): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    await assertAdminWrite();
    await requireFlagOn();
    if (!input.staffId) return actionFail("Chọn nhân viên.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_create_staff_account", {
      p_staff_id: input.staffId,
      p_name: input.name?.trim() || null,
    });
    if (error) return actionFail(error.message || "Không tạo được tài khoản.");

    revalidatePath(ROUTES.fundCash);
    const row = (data ?? {}) as { id?: string; code?: string };
    return actionOk({ id: String(row.id), code: String(row.code ?? "") });
  } catch (err) {
    return actionFail(formatActionError(err, "Không tạo được tài khoản."));
  }
}

export async function adminCapitalCash(input: {
  direction: "IN" | "OUT";
  amountDong: number;
  content: string;
  reason?: string;
  moneyKind?: "CASH" | "BANK";
}): Promise<ActionResult<{ ledgerId: string }>> {
  try {
    await assertAdminWrite();
    await requireFlagOn();
    const amount = Math.trunc(Number(input.amountDong));
    if (!Number.isFinite(amount) || amount <= 0) {
      return actionFail("Số tiền không hợp lệ.");
    }

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_admin_capital", {
      p_idempotency_key: idemKey("cap"),
      p_direction: input.direction,
      p_amount_dong: amount,
      p_content: input.content,
      p_reason: input.reason?.trim() || null,
      p_money_kind: input.moneyKind === "BANK" ? "BANK" : "CASH",
    });
    if (error) return actionFail(error.message || "Không ghi nhận vốn Quỹ Admin.");

    revalidatePath(ROUTES.fundCash);
    return actionOk({ ledgerId: String((data as { ledgerId?: string })?.ledgerId ?? "") });
  } catch (err) {
    return actionFail(formatActionError(err, "Không ghi nhận vốn Quỹ Admin."));
  }
}

export async function adminAllocateCash(input: {
  staffAccountId: string;
  direction: "IN" | "OUT";
  amountDong: number;
  content: string;
  reason?: string;
  moneyKind?: "CASH" | "BANK";
}): Promise<ActionResult<{ transferGroupId: string }>> {
  try {
    await assertAdminWrite();
    await requireFlagOn();
    const amount = Math.trunc(Number(input.amountDong));
    if (!input.staffAccountId) return actionFail("Chọn tài khoản nhân viên.");
    if (!Number.isFinite(amount) || amount <= 0) {
      return actionFail("Số tiền không hợp lệ.");
    }

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_admin_allocate", {
      p_idempotency_key: idemKey("alloc"),
      p_staff_account_id: input.staffAccountId,
      p_direction: input.direction,
      p_amount_dong: amount,
      p_content: input.content,
      p_reason: input.reason?.trim() || null,
      p_money_kind: input.moneyKind === "BANK" ? "BANK" : "CASH",
    });
    if (error) return actionFail(error.message || "Không phân bổ được.");

    revalidatePath(ROUTES.fundCash);
    return actionOk({
      transferGroupId: String((data as { transferGroupId?: string })?.transferGroupId ?? ""),
    });
  } catch (err) {
    return actionFail(formatActionError(err, "Không phân bổ được."));
  }
}

export async function refreshCashTransfers(input?: {
  status?: string | null;
}): Promise<ActionResult<CashTransferListPage>> {
  try {
    await requireFlagOn();
    return actionOk(await listCashTransfers(input));
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được chứng từ CTCT."));
  }
}

export async function createCashTransfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amountDong: number;
  content: string;
  moneyKind?: "CASH" | "BANK";
}): Promise<ActionResult<{ id: string; code: string; transfer: CashTransferRow | null }>> {
  try {
    await assertStaffMutate();
    await requireFlagOn();
    const amount = Math.trunc(Number(input.amountDong));
    if (!input.fromAccountId || !input.toAccountId) {
      return actionFail("Chọn tài khoản gửi và nhận.");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return actionFail("Số tiền không hợp lệ.");
    }
    if (!input.content.trim()) return actionFail("Nhập nội dung chuyển tiền.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_transfer_create", {
      p_from_account_id: input.fromAccountId,
      p_to_account_id: input.toAccountId,
      p_amount_dong: amount,
      p_content: input.content.trim(),
      p_money_kind: input.moneyKind === "BANK" ? "BANK" : "CASH",
    });
    if (error) return actionFail(error.message || "Không tạo được chứng từ CTCT.");

    revalidatePath(ROUTES.fundCash);
    const row = (data ?? {}) as { id?: string; code?: string };
    const id = String(row.id ?? "");
    let transfer: CashTransferRow | null = null;
    if (id) {
      try {
        transfer = await getCashTransfer(id);
      } catch {
        transfer = null;
      }
    }
    return actionOk({ id, code: String(row.code ?? ""), transfer });
  } catch (err) {
    return actionFail(formatActionError(err, "Không tạo được chứng từ CTCT."));
  }
}

export async function confirmCashTransfer(
  transferId: string,
): Promise<ActionResult<{ code: string; alreadyConfirmed: boolean }>> {
  try {
    await assertStaffMutate();
    await requireFlagOn();
    if (!transferId) return actionFail("Thiếu mã chứng từ.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_transfer_confirm", {
      p_transfer_id: transferId,
    });
    if (error) return actionFail(error.message || "Không xác nhận được CTCT.");

    revalidatePath(ROUTES.fundCash);
    const row = (data ?? {}) as { code?: string; alreadyConfirmed?: boolean };
    return actionOk({
      code: String(row.code ?? ""),
      alreadyConfirmed: Boolean(row.alreadyConfirmed),
    });
  } catch (err) {
    return actionFail(formatActionError(err, "Không xác nhận được CTCT."));
  }
}

export async function cancelCashTransfer(input: {
  transferId: string;
  reason?: string;
}): Promise<ActionResult<{ code: string }>> {
  try {
    await assertStaffMutate();
    await requireFlagOn();
    if (!input.transferId) return actionFail("Thiếu mã chứng từ.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_transfer_cancel", {
      p_transfer_id: input.transferId,
      p_reason: input.reason?.trim() || null,
    });
    if (error) return actionFail(error.message || "Không hủy được CTCT.");

    revalidatePath(ROUTES.fundCash);
    return actionOk({ code: String((data as { code?: string })?.code ?? "") });
  } catch (err) {
    return actionFail(formatActionError(err, "Không hủy được CTCT."));
  }
}

export async function refreshCashRequests(input?: {
  status?: string | null;
}): Promise<ActionResult<CashRequestListPage>> {
  try {
    await requireFlagOn();
    return actionOk(await listCashRequests(input));
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được hàng đợi YC."));
  }
}

export async function createCashRequestFromSale(input: {
  saleId: string;
  amountDong?: number;
  note?: string;
}): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    await assertAdminWrite();
    await requireFlagOn();
    if (!input.saleId) return actionFail("Thiếu mã hóa đơn bán.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_request_create_from_sale", {
      p_sale_id: input.saleId,
      p_amount_dong: input.amountDong != null ? Math.trunc(input.amountDong) : null,
      p_note: input.note?.trim() || null,
    });
    if (error) return actionFail(error.message || "Không tạo được YC thu.");

    revalidatePath(ROUTES.fundCash);
    const row = (data ?? {}) as { id?: string; code?: string };
    return actionOk({ id: String(row.id), code: String(row.code ?? "") });
  } catch (err) {
    return actionFail(formatActionError(err, "Không tạo được YC thu."));
  }
}

export async function confirmCashRequest(
  requestId: string,
): Promise<
  ActionResult<{
    code: string;
    alreadyConfirmed: boolean;
    cashAccountCode: string;
    moneyKind: "CASH" | "BANK";
  }>
> {
  try {
    await assertStaffMutate();
    await requireFlagOn();
    if (!requestId) return actionFail("Thiếu mã yêu cầu.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_request_confirm", {
      p_request_id: requestId,
    });
    if (error) return actionFail(error.message || "Không xác nhận được YC.");

    revalidatePath(ROUTES.fundCash);
    const row = (data ?? {}) as {
      code?: string;
      alreadyConfirmed?: boolean;
      cashAccountCode?: string;
      moneyKind?: string;
    };
    return actionOk({
      code: String(row.code ?? ""),
      alreadyConfirmed: Boolean(row.alreadyConfirmed),
      cashAccountCode: String(row.cashAccountCode ?? ""),
      moneyKind: String(row.moneyKind ?? "CASH").toUpperCase() === "BANK" ? "BANK" : "CASH",
    });
  } catch (err) {
    return actionFail(formatActionError(err, "Không xác nhận được YC."));
  }
}

export async function rejectCashRequest(input: {
  requestId: string;
  reason?: string;
}): Promise<ActionResult<{ code: string }>> {
  try {
    await assertStaffMutate();
    await requireFlagOn();
    if (!input.requestId) return actionFail("Thiếu mã yêu cầu.");

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_employee_cash_request_reject", {
      p_request_id: input.requestId,
      p_reason: input.reason?.trim() || null,
    });
    if (error) return actionFail(error.message || "Không từ chối được YC.");

    revalidatePath(ROUTES.fundCash);
    return actionOk({ code: String((data as { code?: string })?.code ?? "") });
  } catch (err) {
    return actionFail(formatActionError(err, "Không từ chối được YC."));
  }
}
