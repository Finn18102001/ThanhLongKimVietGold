import { createServerSupabase } from "@/shared/supabase/server";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import type {
  EmployeeGoldAccess,
  EmployeeGoldAccount,
  EmployeeGoldCountRow,
  EmployeeGoldLedgerPage,
  EmployeeGoldStockRow,
  GoldSkuOption,
} from "./types";

function mapAccount(raw: Record<string, unknown>): EmployeeGoldAccount {
  return {
    id: String(raw.id),
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    kind: raw.kind === "ADMIN_POOL" ? "ADMIN_POOL" : "STAFF",
    staffId: raw.staffId ? String(raw.staffId) : null,
    staffName: raw.staffName ? String(raw.staffName) : null,
    staffEmail: raw.staffEmail ? String(raw.staffEmail) : null,
    isActive: Boolean(raw.isActive),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  };
}

function mapStock(raw: Record<string, unknown>): EmployeeGoldStockRow {
  return {
    accountId: String(raw.accountId),
    accountCode: String(raw.accountCode ?? ""),
    accountName: String(raw.accountName ?? ""),
    skuId: String(raw.skuId),
    skuCode: String(raw.skuCode ?? ""),
    skuName: String(raw.skuName ?? ""),
    quantity: Number(raw.quantity ?? 0),
    storeQuantity: Number(raw.storeQuantity ?? 0),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  };
}

function mapCount(raw: Record<string, unknown>): EmployeeGoldCountRow {
  const lines = ((raw.lines as Record<string, unknown>[]) ?? []).map((l) => ({
    skuId: String(l.skuId),
    skuCode: String(l.skuCode ?? ""),
    skuName: String(l.skuName ?? ""),
    systemQty: Number(l.systemQty ?? 0),
    countedQty: Number(l.countedQty ?? 0),
    diffQty: Number(l.diffQty ?? 0),
    note: l.note ? String(l.note) : null,
  }));
  return {
    id: String(raw.id),
    code: String(raw.code ?? ""),
    accountId: String(raw.accountId),
    accountCode: String(raw.accountCode ?? ""),
    note: raw.note ? String(raw.note) : null,
    countedByEmail: String(raw.countedByEmail ?? ""),
    countedAt: String(raw.countedAt ?? ""),
    lines,
  };
}

export async function getEmployeeGoldAccess(): Promise<EmployeeGoldAccess> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_gold_my_access");
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    canAccess: Boolean(row.canAccess),
    isAdmin: Boolean(row.isAdmin),
    staffAccountId: row.staffAccountId ? String(row.staffAccountId) : null,
  };
}

export async function listEmployeeGoldAccounts(): Promise<EmployeeGoldAccount[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_gold_list_accounts");
  if (error) throw new Error(error.message);
  const items = ((data as { items?: unknown[] } | null)?.items ?? []) as Record<
    string,
    unknown
  >[];
  return items.map(mapAccount);
}

export async function listEmployeeGoldStock(
  accountId?: string | null,
): Promise<EmployeeGoldStockRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_gold_list_stock", {
    p_account_id: accountId || null,
  });
  if (error) throw new Error(error.message);
  const items = ((data as { items?: unknown[] } | null)?.items ?? []) as Record<
    string,
    unknown
  >[];
  return items.map(mapStock);
}

export async function listEmployeeGoldLedger(input?: {
  accountId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<EmployeeGoldLedgerPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_gold_list_ledger", {
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
    skuId: String(r.skuId),
    skuCode: String(r.skuCode ?? ""),
    skuName: String(r.skuName ?? ""),
    txnType: String(r.txnType ?? ""),
    direction: r.direction === "OUT" ? ("OUT" as const) : ("IN" as const),
    quantity: Number(r.quantity ?? 0),
    qtyBefore: Number(r.qtyBefore ?? 0),
    qtyAfter: Number(r.qtyAfter ?? 0),
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

export async function listEmployeeGoldCounts(input?: {
  accountId?: string | null;
  limit?: number;
}): Promise<EmployeeGoldCountRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_gold_list_counts", {
    p_account_id: input?.accountId || null,
    p_limit: input?.limit ?? 30,
  });
  if (error) throw new Error(error.message);
  const items = ((data as { items?: unknown[] } | null)?.items ?? []) as Record<
    string,
    unknown
  >[];
  return items.map(mapCount);
}

export async function searchGoldSkus(
  query = "",
  limit = 20,
): Promise<GoldSkuOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_employee_gold_search_skus", {
    p_query: query,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const items = ((data as { items?: unknown[] } | null)?.items ?? []) as Record<
    string,
    unknown
  >[];
  return items.map((r) => ({
    skuId: String(r.skuId),
    skuCode: String(r.skuCode ?? ""),
    skuName: String(r.skuName ?? ""),
    storeQuantity: Number(r.storeQuantity ?? 0),
  }));
}

/** Gate: Flag ON + (Admin hoặc NV được gán Quỹ vàng). */
export async function canOpenEmployeeGoldModule(): Promise<{
  flagOn: boolean;
  access: EmployeeGoldAccess;
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
  const access = await getEmployeeGoldAccess();
  return { flagOn: true, access, allowed: access.canAccess };
}
