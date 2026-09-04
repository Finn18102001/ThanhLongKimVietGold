import { addVnCalendarDays } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
import type {
  CapitalSnapshot,
  CashAccountCard,
  CashflowOverview,
  CashLedgerFilters,
  CashLedgerPage,
  CashLedgerRow,
  CashTxnType,
} from "./types";

function mapAccount(raw: Record<string, unknown> | null): CashAccountCard | null {
  if (!raw) return null;
  return {
    id: String(raw.id),
    code: String(raw.code),
    name: String(raw.name),
    accountType: String(raw.accountType) === "BANK" ? "BANK" : "CASH",
    balanceDong: Number(raw.balanceDong ?? 0),
    inTodayDong: Number(raw.inTodayDong ?? 0),
    outTodayDong: Number(raw.outTodayDong ?? 0),
    txnToday: Number(raw.txnToday ?? 0),
  };
}

export function defaultCashflowRange(businessDate?: string): { from: string; to: string } {
  const to = businessDate ?? new Date().toISOString().slice(0, 10);
  return { from: addVnCalendarDays(to, -6), to };
}

export async function getCashflowOverview(): Promise<CashflowOverview> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_cashflow_overview");
  if (error) throw new Error(error.message);
  const raw = data as Record<string, unknown>;
  const seven = (raw.sevenDay ?? {}) as Record<string, unknown>;
  return {
    businessDate: String(raw.businessDate),
    cash: mapAccount((raw.cash ?? null) as Record<string, unknown> | null),
    bank: mapAccount((raw.bank ?? null) as Record<string, unknown> | null),
    availableDong: Number(raw.availableDong ?? 0),
    sevenDay: {
      inDong: Number(seven.inDong ?? 0),
      outDong: Number(seven.outDong ?? 0),
      netDong: Number(seven.netDong ?? 0),
    },
    receivableDong: Number(raw.receivableDong ?? 0),
    payableDong: Number(raw.payableDong ?? 0),
    stockCapitalDong: Number(raw.stockCapitalDong ?? 0),
  };
}

export async function getCashLedger(filters: CashLedgerFilters): Promise<CashLedgerPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_cashflow_list", {
    p_from: filters.from,
    p_to: filters.to,
    p_account_id: filters.accountId || null,
    p_txn_type: filters.txnType || null,
    p_direction: filters.direction || null,
    p_q: filters.q || null,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) throw new Error(error.message);
  const raw = data as Record<string, unknown>;
  const items = ((raw.items ?? []) as Array<Record<string, unknown>>).map(
    (row): CashLedgerRow => ({
      id: String(row.id),
      occurredAt: String(row.occurredAt),
      txnType: String(row.txnType) as CashTxnType,
      direction: String(row.direction) === "OUT" ? "OUT" : "IN",
      amountDong: Number(row.amountDong ?? 0),
      balanceAfterDong: Number(row.balanceAfterDong ?? 0),
      content: String(row.content ?? ""),
      accountCode: String(row.accountCode ?? ""),
      accountName: String(row.accountName ?? ""),
      referenceCode: row.referenceCode == null ? null : String(row.referenceCode),
      actorEmail: String(row.actorEmail ?? ""),
    }),
  );
  return {
    items,
    total: Number(raw.total ?? 0),
    sumInDong: Number(raw.sumInDong ?? 0),
    sumOutDong: Number(raw.sumOutDong ?? 0),
    netDong: Number(raw.netDong ?? 0),
  };
}

export async function getCapitalSnapshot(): Promise<CapitalSnapshot> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_cashflow_capital_by_group");
  if (error) throw new Error(error.message);
  const raw = data as Record<string, unknown>;
  return {
    totalDong: Number(raw.totalDong ?? 0),
    groups: ((raw.groups ?? []) as Array<Record<string, unknown>>).map((row) => ({
      groupName: String(row.groupName),
      capitalDong: Number(row.capitalDong ?? 0),
      sharePercent: Number(row.sharePercent ?? 0),
    })),
  };
}
