import { addVnCalendarDays } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
import type {
  CapitalSnapshot,
  CashAccountCard,
  CashflowOverview,
  CashLedgerFilters,
  CashLedgerPage,
  CashLedgerRow,
  CashObligationRow,
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
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 5000);
  const offset = Math.max(filters.offset ?? 0, 0);
  const { data, error } = await supabase.rpc("pos_cashflow_list", {
    p_from: filters.from,
    p_to: filters.to,
    p_account_id: filters.accountId || null,
    p_txn_type: filters.txnType || null,
    p_direction: filters.direction || null,
    p_q: filters.q || null,
    p_limit: limit,
    p_offset: offset,
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
      customerName:
        row.customerName == null || String(row.customerName).trim() === ""
          ? null
          : String(row.customerName),
      customerCitizenId:
        row.customerCitizenId == null || String(row.customerCitizenId).trim() === ""
          ? null
          : String(row.customerCitizenId),
    }),
  );
  return {
    items,
    total: Number(raw.total ?? 0),
    limit,
    offset,
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

/**
 * Orders that generated a cash debt: sales still (or once) owed by the customer,
 * and buys the shop still (or once) owed the customer. Reads the order headers
 * directly, so it never posts anything into the cash ledger.
 */
export async function getCashObligations(): Promise<CashObligationRow[]> {
  const supabase = await createServerSupabase();

  const [salesRes, buysRes, receiptsRes] = await Promise.all([
    supabase
      .from("pos_sales")
      .select(
        "id, sale_no, completed_at, total_dong, paid_dong, remaining_dong, payment_status, due_date, actor_email, transaction_type, pos_customers(name), pos_invoices(invoice_no)",
      )
      .eq("status", "COMPLETED")
      .or("remaining_dong.gt.0,payment_status.neq.PAID")
      .order("completed_at", { ascending: false })
      .limit(2000),
    supabase
      .from("pos_buys")
      .select(
        "id, buy_no, completed_at, total_dong, paid_dong, remaining_dong, payment_status, due_date, actor_email, pos_customers(name), pos_payables(total_dong, paid_dong, remaining_dong, status)",
      )
      .eq("status", "COMPLETED")
      .or("remaining_dong.gt.0,payment_status.neq.PAID")
      .order("completed_at", { ascending: false })
      .limit(2000),
    supabase
      .from("pos_purchase_receipts")
      .select(
        "id, receipt_no, created_at, total_dong, paid_dong, remaining_dong, payment_status, actor_email, supplier_name, goods_status, voided_at",
      )
      .is("voided_at", null)
      .in("goods_status", ["RECEIVED", "SOLD", "RETURNED"])
      .gt("remaining_dong", 0)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (buysRes.error) throw new Error(buysRes.error.message);
  if (receiptsRes.error) throw new Error(receiptsRes.error.message);

  const first = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  const sales: CashObligationRow[] = (salesRes.data ?? []).map((row) => {
    const customer = first(row.pos_customers as { name: string } | { name: string }[] | null);
    const invoice = first(
      row.pos_invoices as { invoice_no: string } | { invoice_no: string }[] | null,
    );
    return {
      id: `sale-${row.id}`,
      side: "RECEIVABLE",
      code: String(row.sale_no ?? ""),
      invoiceNo: invoice?.invoice_no ? String(invoice.invoice_no) : null,
      occurredAt: String(row.completed_at ?? ""),
      partyName: customer?.name ? String(customer.name) : "Khách lẻ",
      transactionType: String(row.transaction_type ?? "SALE"),
      totalDong: Number(row.total_dong ?? 0),
      settledDong: Number(row.paid_dong ?? 0),
      remainingDong: Number(row.remaining_dong ?? 0),
      paymentStatus: String(row.payment_status ?? ""),
      actorEmail: String(row.actor_email ?? ""),
      dueDate: row.due_date ? String(row.due_date) : null,
    };
  });

  const buys: CashObligationRow[] = (buysRes.data ?? []).map((row) => {
    const customer = first(row.pos_customers as { name: string } | { name: string }[] | null);
    const payable = first(
      row.pos_payables as
        | { total_dong: number; paid_dong: number; remaining_dong: number; status: string }
        | { total_dong: number; paid_dong: number; remaining_dong: number; status: string }[]
        | null,
    );
    const payableOpen = payable != null && payable.status !== "CLOSED";
    return {
      id: `buy-${row.id}`,
      side: "PAYABLE",
      code: String(row.buy_no ?? ""),
      invoiceNo: null,
      occurredAt: String(row.completed_at ?? ""),
      partyName: customer?.name ? String(customer.name) : "Khách lẻ",
      transactionType: "BUY",
      totalDong: Number(payableOpen ? payable.total_dong : (row.total_dong ?? 0)),
      settledDong: Number(payableOpen ? payable.paid_dong : (row.paid_dong ?? 0)),
      remainingDong: Number(payableOpen ? payable.remaining_dong : (row.remaining_dong ?? 0)),
      paymentStatus: String(row.payment_status ?? ""),
      actorEmail: String(row.actor_email ?? ""),
      dueDate: row.due_date ? String(row.due_date) : null,
    };
  });

  const receipts: CashObligationRow[] = (receiptsRes.data ?? []).map((row) => ({
    id: `receipt-${row.id}`,
    side: "PAYABLE",
    code: String(row.receipt_no ?? ""),
    invoiceNo: null,
    occurredAt: String(row.created_at ?? ""),
    partyName: row.supplier_name ? String(row.supplier_name) : "Nhà cung cấp",
    transactionType: "STOCK_RECEIPT",
    totalDong: Number(row.total_dong ?? 0),
    settledDong: Number(row.paid_dong ?? 0),
    remainingDong: Number(row.remaining_dong ?? 0),
    paymentStatus: String(row.payment_status ?? ""),
    actorEmail: String(row.actor_email ?? ""),
    dueDate: null,
  }));

  return [...sales, ...buys, ...receipts].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
