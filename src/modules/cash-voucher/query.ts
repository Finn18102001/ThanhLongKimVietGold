import { createServerSupabase } from "@/shared/supabase/server";
import { withPerfSpan } from "@/shared/lib/perf-span";
import type {
  CashVoucherKind,
  CashVoucherListFilter,
  CashVoucherListPage,
  CashVoucherRow,
  CashVoucherStatus,
} from "./types";

function asKind(raw: unknown): CashVoucherKind {
  return raw === "CHI" ? "CHI" : "THU";
}

function asStatus(raw: unknown): CashVoucherStatus {
  const s = String(raw ?? "PENDING");
  if (s === "CONFIRMED" || s === "REJECTED" || s === "REVERSED") return s;
  return "PENDING";
}

function mapRow(raw: Record<string, unknown>): CashVoucherRow {
  return {
    id: String(raw.id ?? ""),
    code: String(raw.code ?? ""),
    kind: asKind(raw.kind),
    status: asStatus(raw.status),
    amountDong: Number(raw.amountDong ?? 0),
    paymentMethod: String(raw.paymentMethod ?? "CASH"),
    content: String(raw.content ?? ""),
    sourceType: String(raw.sourceType ?? ""),
    sourceId: String(raw.sourceId ?? ""),
    sourceCode: raw.sourceCode ? String(raw.sourceCode) : null,
    customerName: raw.customerName ? String(raw.customerName) : null,
    createdByEmail: String(raw.createdByEmail ?? ""),
    createdAt: String(raw.createdAt ?? ""),
    cashAccountCode: raw.cashAccountCode ? String(raw.cashAccountCode) : null,
    cashAccountName: raw.cashAccountName ? String(raw.cashAccountName) : null,
    cashHolderName: raw.cashHolderName ? String(raw.cashHolderName) : null,
    cashHolderEmail: raw.cashHolderEmail ? String(raw.cashHolderEmail) : null,
    goldAccountCode: raw.goldAccountCode ? String(raw.goldAccountCode) : null,
    goldAccountName: raw.goldAccountName ? String(raw.goldAccountName) : null,
    goldHolderName: raw.goldHolderName ? String(raw.goldHolderName) : null,
    confirmedByEmail: raw.confirmedByEmail ? String(raw.confirmedByEmail) : null,
    confirmedAt: raw.confirmedAt ? String(raw.confirmedAt) : null,
    rejectedByEmail: raw.rejectedByEmail ? String(raw.rejectedByEmail) : null,
    rejectedAt: raw.rejectedAt ? String(raw.rejectedAt) : null,
    rejectReason: raw.rejectReason ? String(raw.rejectReason) : null,
    reversedByEmail: raw.reversedByEmail ? String(raw.reversedByEmail) : null,
    reversedAt: raw.reversedAt ? String(raw.reversedAt) : null,
  };
}

function mapPage(data: unknown): CashVoucherListPage {
  const raw = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items)
    ? raw.items.map((row) => mapRow(row as Record<string, unknown>))
    : [];
  return {
    items,
    total: Number(raw.total ?? 0),
    limit: Number(raw.limit ?? 50),
    offset: Number(raw.offset ?? 0),
  };
}

export async function listCashVouchers(
  filter: CashVoucherListFilter = {},
): Promise<CashVoucherListPage> {
  return withPerfSpan("cashVoucher.list", async () => {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.rpc("pos_admin_list_cash_vouchers", {
      p_from: filter.from || null,
      p_to: filter.to || null,
      p_code: filter.code || null,
      p_kind: filter.kind || null,
      p_status: filter.status || null,
      p_created_by: filter.createdBy || null,
      p_confirmed_by: filter.confirmedBy || null,
      p_cash_holder: filter.cashHolder || null,
      p_gold_holder: filter.goldHolder || null,
      p_limit: filter.limit ?? 50,
      p_offset: filter.offset ?? 0,
    });
    if (error) throw new Error(error.message);
    return mapPage(data);
  });
}
