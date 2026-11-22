import { createServerSupabase } from "@/shared/supabase/server";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import type {
  CashRequestKind,
  CashRequestListPage,
  CashRequestRow,
  CashRequestStatus,
  CashTransferListPage,
  CashTransferRow,
  CashTransferStatus,
  EmployeeCashAccess,
  EmployeeCashAccount,
  EmployeeCashLedgerPage,
} from "./types";

function mapAccount(raw: Record<string, unknown>): EmployeeCashAccount {
  const balanceDong = Number(raw.balanceDong ?? 0);
  const cashBalanceDong = Number(raw.cashBalanceDong ?? balanceDong);
  const bankBalanceDong = Number(raw.bankBalanceDong ?? 0);
  return {
    id: String(raw.id),
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    kind: raw.kind === "ADMIN_POOL" ? "ADMIN_POOL" : "STAFF",
    staffId: raw.staffId ? String(raw.staffId) : null,
    staffName: raw.staffName ? String(raw.staffName) : null,
    staffEmail: raw.staffEmail ? String(raw.staffEmail) : null,
    balanceDong,
    cashBalanceDong,
    bankBalanceDong,
    isActive: Boolean(raw.isActive),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  };
}

export async function getEmployeeCashAccess(): Promise<EmployeeCashAccess> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_cash_my_access");
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    canAccess: Boolean(row.canAccess),
    isAdmin: Boolean(row.isAdmin),
    staffAccountId: row.staffAccountId ? String(row.staffAccountId) : null,
  };
}

export async function listEmployeeCashAccounts(): Promise<EmployeeCashAccount[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_cash_list_accounts");
  if (error) throw new Error(error.message);
  const items = ((data as { items?: unknown[] } | null)?.items ?? []) as Record<
    string,
    unknown
  >[];
  return items.map(mapAccount);
}

export async function listEmployeeCashLedger(input?: {
  accountId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<EmployeeCashLedgerPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_cash_list_ledger", {
    p_account_id: input?.accountId || null,
    p_limit: input?.limit ?? 50,
    p_offset: input?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const items = ((row.items as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id),
    accountId: String(r.accountId),
    accountCode: String(r.accountCode ?? ""),
    accountName: String(r.accountName ?? ""),
    txnType: String(r.txnType ?? ""),
    direction: r.direction === "OUT" ? ("OUT" as const) : ("IN" as const),
    amountDong: Number(r.amountDong ?? 0),
    moneyKind: String(r.moneyKind ?? "CASH").toUpperCase() === "BANK" ? ("BANK" as const) : ("CASH" as const),
    balanceBeforeDong: Number(r.balanceBeforeDong ?? 0),
    balanceAfterDong: Number(r.balanceAfterDong ?? 0),
    content: String(r.content ?? ""),
    reason: r.reason ? String(r.reason) : null,
    referenceCode: r.referenceCode ? String(r.referenceCode) : null,
    transferGroupId: r.transferGroupId ? String(r.transferGroupId) : null,
    actorEmail: String(r.actorEmail ?? ""),
    occurredAt: String(r.occurredAt ?? ""),
  }));
  return {
    items,
    total: Number(row.total ?? 0),
    limit: Number(row.limit ?? 50),
    offset: Number(row.offset ?? 0),
  };
}

/** Gate: Flag ON + (Admin hoặc NV được gán Quỹ tiền). */
export async function canOpenEmployeeCashModule(): Promise<{
  flagOn: boolean;
  access: EmployeeCashAccess;
  allowed: boolean;
}> {
  const flagOn = await isEmployeeFundEnabled();
  if (!flagOn) {
    return {
      flagOn: false,
      access: { canAccess: false, isAdmin: false, staffAccountId: null },
      allowed: false,
    };
  }
  const access = await getEmployeeCashAccess();
  return { flagOn: true, access, allowed: access.canAccess };
}

function mapTransfer(raw: Record<string, unknown>): CashTransferRow {
  const statusRaw = String(raw.status ?? "PENDING");
  const status: CashTransferStatus =
    statusRaw === "CONFIRMED" || statusRaw === "CANCELLED" ? statusRaw : "PENDING";
  return {
    id: String(raw.id),
    code: String(raw.code ?? ""),
    status,
    amountDong: Number(raw.amountDong ?? 0),
    moneyKind: String(raw.moneyKind ?? "CASH").toUpperCase() === "BANK" ? "BANK" : "CASH",
    content: String(raw.content ?? ""),
    fromAccountId: String(raw.fromAccountId ?? ""),
    fromAccountCode: String(raw.fromAccountCode ?? ""),
    fromAccountName: String(raw.fromAccountName ?? ""),
    fromStaffName: raw.fromStaffName ? String(raw.fromStaffName) : null,
    fromStaffEmail: raw.fromStaffEmail ? String(raw.fromStaffEmail) : null,
    toAccountId: String(raw.toAccountId ?? ""),
    toAccountCode: String(raw.toAccountCode ?? ""),
    toAccountName: String(raw.toAccountName ?? ""),
    toStaffName: raw.toStaffName ? String(raw.toStaffName) : null,
    toStaffEmail: raw.toStaffEmail ? String(raw.toStaffEmail) : null,
    createdByEmail: String(raw.createdByEmail ?? ""),
    createdAt: String(raw.createdAt ?? ""),
    confirmedByEmail: raw.confirmedByEmail ? String(raw.confirmedByEmail) : null,
    confirmedAt: raw.confirmedAt ? String(raw.confirmedAt) : null,
    cancelledByEmail: raw.cancelledByEmail ? String(raw.cancelledByEmail) : null,
    cancelledAt: raw.cancelledAt ? String(raw.cancelledAt) : null,
    cancelReason: raw.cancelReason ? String(raw.cancelReason) : null,
    transferGroupId: raw.transferGroupId ? String(raw.transferGroupId) : null,
    canConfirm: Boolean(raw.canConfirm),
    canCancel: Boolean(raw.canCancel),
  };
}

export async function listCashTransfers(input?: {
  status?: string | null;
  limit?: number;
  offset?: number;
}): Promise<CashTransferListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_cash_transfer_list", {
    p_status: input?.status || null,
    p_limit: input?.limit ?? 50,
    p_offset: input?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const items = ((row.items as Record<string, unknown>[]) ?? []).map(mapTransfer);
  return {
    items,
    total: Number(row.total ?? 0),
    limit: Number(row.limit ?? 50),
    offset: Number(row.offset ?? 0),
  };
}

export async function getCashTransfer(id: string): Promise<CashTransferRow> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_cash_transfer_get", {
    p_transfer_id: id,
  });
  if (error) throw new Error(error.message);
  return mapTransfer((data ?? {}) as Record<string, unknown>);
}

function mapCashRequest(raw: Record<string, unknown>): CashRequestRow {
  const statusRaw = String(raw.status ?? "PENDING");
  const status: CashRequestStatus =
    statusRaw === "CONFIRMED" || statusRaw === "REJECTED" || statusRaw === "REVERSED"
      ? statusRaw
      : "PENDING";
  const kind: CashRequestKind = raw.kind === "CHI" ? "CHI" : "THU";
  const linesRaw = Array.isArray(raw.lines) ? (raw.lines as Record<string, unknown>[]) : [];
  return {
    id: String(raw.id),
    code: String(raw.code ?? ""),
    kind,
    status,
    amountDong: Number(raw.amountDong ?? 0),
    paymentMethod: String(raw.paymentMethod ?? "CASH"),
    content: String(raw.content ?? ""),
    note: raw.note ? String(raw.note) : null,
    sourceType: raw.sourceType === "buy" ? "buy" : "sale",
    sourceId: String(raw.sourceId ?? ""),
    sourceCode: raw.sourceCode ? String(raw.sourceCode) : null,
    customerName: raw.customerName ? String(raw.customerName) : null,
    customerCccd: raw.customerCccd ? String(raw.customerCccd) : null,
    relatedStaffName: raw.relatedStaffName ? String(raw.relatedStaffName) : null,
    relatedGoldAccountCode: raw.relatedGoldAccountCode
      ? String(raw.relatedGoldAccountCode)
      : null,
    requestedByEmail: String(raw.requestedByEmail ?? ""),
    createdAt: String(raw.createdAt ?? ""),
    cashAccountCode: raw.cashAccountCode ? String(raw.cashAccountCode) : null,
    confirmedByEmail: raw.confirmedByEmail ? String(raw.confirmedByEmail) : null,
    confirmedAt: raw.confirmedAt ? String(raw.confirmedAt) : null,
    rejectedByEmail: raw.rejectedByEmail ? String(raw.rejectedByEmail) : null,
    rejectedAt: raw.rejectedAt ? String(raw.rejectedAt) : null,
    rejectReason: raw.rejectReason ? String(raw.rejectReason) : null,
    lines: linesRaw.map((l) => ({
      name: String(l.name ?? ""),
      purity: l.purity != null ? String(l.purity) : null,
      unit: l.unit != null ? String(l.unit) : null,
      weight: l.weight != null ? Number(l.weight) : null,
      unitPriceDong: l.unitPriceDong != null ? Number(l.unitPriceDong) : null,
      amountDong: l.amountDong != null ? Number(l.amountDong) : null,
    })),
    canConfirm: Boolean(raw.canConfirm),
    canReject: Boolean(raw.canReject),
  };
}

export async function listCashRequests(input?: {
  status?: string | null;
  limit?: number;
  offset?: number;
}): Promise<CashRequestListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_cash_request_list", {
    p_status: input?.status || null,
    p_limit: input?.limit ?? 50,
    p_offset: input?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const items = ((row.items as Record<string, unknown>[]) ?? []).map(mapCashRequest);
  return {
    items,
    total: Number(row.total ?? 0),
    limit: Number(row.limit ?? 50),
    offset: Number(row.offset ?? 0),
  };
}

/** Load one YC for print / status (QV In phiếu after issue). */
export async function getCashRequest(id: string): Promise<CashRequestRow> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_cash_request_get", {
    p_request_id: id,
  });
  if (error) throw new Error(error.message);
  return mapCashRequest((data ?? {}) as Record<string, unknown>);
}
