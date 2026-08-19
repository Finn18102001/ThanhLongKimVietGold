"use server";

import { addVnCalendarDays } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
import type { ReportingSnapshot } from "./types";

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
      revenueDong: Number(row.revenue_dong),
    })),
  };
}

export async function getReportingSnapshot(from: string, to: string): Promise<ReportingSnapshot> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_reporting", {
    p_from: from,
    p_to: to,
    p_actor_email: null,
  });
  if (error) throw new Error(error.message);
  return mapSnapshot(data as Record<string, unknown>);
}
