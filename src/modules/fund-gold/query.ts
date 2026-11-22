import { createServerSupabase } from "@/shared/supabase/server";
import { isEmployeeFundEnabled } from "@/modules/settings/query";
import type {
  EmployeeGoldAccess,
  EmployeeGoldAccount,
  EmployeeGoldCountRow,
  EmployeeGoldLedgerPage,
  EmployeeGoldStockRow,
  GoldSkuOption,
  GoldTransferListPage,
  GoldTransferRow,
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

type EmbedAccount = {
  id?: string;
  code?: string;
  name?: string;
};

type EmbedSku = { id?: string; sku?: string; name?: string } | null;

function oneEmbed<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const GOLD_TRANSFER_SELECT = `
  id,
  code,
  quantity,
  content,
  created_by_email,
  created_at,
  transfer_group_id,
  from_account_id,
  to_account_id,
  sku_id,
  from_account:pos_employee_gold_accounts!from_account_id(id, code, name),
  to_account:pos_employee_gold_accounts!to_account_id(id, code, name),
  sku:pos_skus!sku_id(id, sku, name)
`;

function mapGoldTransferRow(
  r: Record<string, unknown>,
  staffByAccountId: Map<string, string | null>,
): GoldTransferRow {
  const fromAcc = oneEmbed(r.from_account as EmbedAccount | EmbedAccount[] | null);
  const toAcc = oneEmbed(r.to_account as EmbedAccount | EmbedAccount[] | null);
  const sku = oneEmbed(r.sku as EmbedSku | EmbedSku[] | null);
  const fromId = String(r.from_account_id ?? fromAcc?.id ?? "");
  const toId = String(r.to_account_id ?? toAcc?.id ?? "");
  return {
    id: String(r.id),
    code: String(r.code ?? ""),
    quantity: Number(r.quantity ?? 0),
    content: String(r.content ?? ""),
    fromAccountId: fromId,
    fromAccountCode: String(fromAcc?.code ?? ""),
    fromAccountName: String(fromAcc?.name ?? ""),
    fromStaffName: staffByAccountId.get(fromId) ?? null,
    toAccountId: toId,
    toAccountCode: String(toAcc?.code ?? ""),
    toAccountName: String(toAcc?.name ?? ""),
    toStaffName: staffByAccountId.get(toId) ?? null,
    skuId: String(r.sku_id ?? sku?.id ?? ""),
    skuCode: String(sku?.sku ?? ""),
    skuName: String(sku?.name ?? ""),
    createdByEmail: String(r.created_by_email ?? ""),
    createdAt: String(r.created_at ?? ""),
    transferGroupId: r.transfer_group_id ? String(r.transfer_group_id) : null,
  };
}

async function goldStaffNameByAccountId(): Promise<Map<string, string | null>> {
  try {
    const accounts = await listEmployeeGoldAccounts();
    return new Map(accounts.map((a) => [a.id, a.staffName]));
  } catch {
    return new Map();
  }
}

/** Danh sách chứng từ CTCV — SELECT bảng transfers (RLS), join account + SKU. */
export async function listEmployeeGoldTransfers(input?: {
  limit?: number;
}): Promise<GoldTransferListPage> {
  const supabase = await createServerSupabase();
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);
  const [staffByAccountId, result] = await Promise.all([
    goldStaffNameByAccountId(),
    supabase
      .from("pos_employee_gold_transfers")
      .select(GOLD_TRANSFER_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (result.error) throw new Error(result.error.message);

  const items: GoldTransferRow[] = ((result.data ?? []) as Record<string, unknown>[]).map(
    (r) => mapGoldTransferRow(r, staffByAccountId),
  );

  return { items, total: items.length };
}

export async function getEmployeeGoldTransfer(id: string): Promise<GoldTransferRow | null> {
  if (!id) return null;
  const supabase = await createServerSupabase();
  const [staffByAccountId, result] = await Promise.all([
    goldStaffNameByAccountId(),
    supabase
      .from("pos_employee_gold_transfers")
      .select(GOLD_TRANSFER_SELECT)
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  return mapGoldTransferRow(result.data as Record<string, unknown>, staffByAccountId);
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
