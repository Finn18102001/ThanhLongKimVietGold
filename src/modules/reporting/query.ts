"use server";

import { addVnCalendarDays } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
import type { ReportingSnapshot, StaffSalesRow, TransactionExportRow } from "./types";

function fillDailyRange(
  from: string,
  to: string,
  daily: ReportingSnapshot["daily"],
): ReportingSnapshot["daily"] {
  const map = new Map(daily.map((row) => [row.date, row]));
  const filled: ReportingSnapshot["daily"] = [];
  let cursor = from;
  while (cursor <= to) {
    filled.push(
      map.get(cursor) ?? {
        date: cursor,
        revenueDong: 0,
        invoiceCount: 0,
      },
    );
    cursor = addVnCalendarDays(cursor, 1);
  }
  return filled;
}

function mapSnapshot(raw: Record<string, unknown>): ReportingSnapshot {
  const from = String(raw.from);
  const to = String(raw.to);
  const daily = ((raw.daily ?? []) as Array<Record<string, unknown>>).map((row) => ({
    date: String(row.date),
    revenueDong: Number(row.revenue_dong),
    invoiceCount: Number(row.invoice_count),
  }));

  return {
    from,
    to,
    totalRevenueDong: Number(raw.total_revenue_dong),
    invoiceCount: Number(raw.invoice_count),
    avgInvoiceDong: Number(raw.avg_invoice_dong),
    returnsTotalDong: Number(raw.returns_total_dong),
    netRevenueDong: Number(raw.net_revenue_dong),
    daily: fillDailyRange(from, to, daily),
    topProducts: ((raw.top_products ?? []) as Array<Record<string, unknown>>).map((row) => ({
      sku: String(row.sku),
      name: String(row.name),
      quantitySold: Number(row.quantity_sold),
      weightChiSold: Number(row.weight_chi_sold ?? 0),
      revenueDong: Number(row.revenue_dong),
    })),
  };
}

/** Total weight (chi) sold per SKU from sale-item snapshots in range. */
async function loadTopProductWeights(
  from: string,
  to: string,
  skus: string[],
): Promise<Map<string, number>> {
  const weights = new Map<string, number>();
  if (skus.length === 0) return weights;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_sale_items")
    .select(
      "quantity, weight_chi, pos_skus!inner(sku), pos_sales!inner(status, completed_at)",
    )
    .eq("pos_sales.status", "COMPLETED")
    .gte("pos_sales.completed_at", `${from}T00:00:00+07:00`)
    .lte("pos_sales.completed_at", `${to}T23:59:59.999+07:00`)
    .in("pos_skus.sku", skus);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const skuEmbed = row.pos_skus as { sku: string } | { sku: string }[] | null;
    const sku = Array.isArray(skuEmbed) ? skuEmbed[0]?.sku : skuEmbed?.sku;
    if (!sku) continue;
    const add = Number(row.quantity) * Number(row.weight_chi);
    weights.set(sku, (weights.get(sku) ?? 0) + add);
  }
  return weights;
}

export async function getReportingSnapshot(from: string, to: string): Promise<ReportingSnapshot> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_reporting", {
    p_from: from,
    p_to: to,
    p_actor_email: null,
  });
  if (error) throw new Error(error.message);
  const snapshot = mapSnapshot(data as Record<string, unknown>);
  const weightBySku = await loadTopProductWeights(
    snapshot.from,
    snapshot.to,
    snapshot.topProducts.map((row) => row.sku),
  );
  return {
    ...snapshot,
    topProducts: snapshot.topProducts.map((row) => ({
      ...row,
      weightChiSold: weightBySku.get(row.sku) ?? row.weightChiSold,
    })),
  };
}

function mapStaffSalesRow(raw: Record<string, unknown>): StaffSalesRow {
  return {
    actorEmail: String(raw.actorEmail ?? ""),
    invoiceCount: Number(raw.invoiceCount ?? 0),
    grossDong: Number(raw.grossDong ?? 0),
    collectedDong: Number(raw.collectedDong ?? 0),
    remainingDong: Number(raw.remainingDong ?? 0),
  };
}

function mapTransactionExportRow(raw: Record<string, unknown>): TransactionExportRow {
  const type = String(raw.type ?? "") === "BUY" ? "BUY" : "SELL";
  return {
    type,
    code: String(raw.code ?? ""),
    invoiceNo: raw.invoiceNo == null || raw.invoiceNo === "" ? null : String(raw.invoiceNo),
    customerName: String(raw.customerName ?? ""),
    customerPhone: String(raw.customerPhone ?? ""),
    totalDong: Number(raw.totalDong ?? 0),
    paidDong: Number(raw.paidDong ?? 0),
    remainingDong: Number(raw.remainingDong ?? 0),
    paymentStatus: String(raw.paymentStatus ?? ""),
    paymentMethod:
      raw.paymentMethod == null || raw.paymentMethod === ""
        ? null
        : String(raw.paymentMethod),
    dueDate: raw.dueDate == null || raw.dueDate === "" ? null : String(raw.dueDate),
    actorEmail: String(raw.actorEmail ?? ""),
    completedAt: String(raw.completedAt ?? ""),
  };
}

export async function getStaffSalesReport(from: string, to: string): Promise<StaffSalesRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_report_staff_sales", {
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapStaffSalesRow(row as Record<string, unknown>));
}

export async function getTransactionExport(
  from: string,
  to: string,
): Promise<TransactionExportRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_export_transactions", {
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapTransactionExportRow(row as Record<string, unknown>));
}
