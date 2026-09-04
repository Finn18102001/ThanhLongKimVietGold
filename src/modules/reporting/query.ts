"use server";

import { addVnCalendarDays, formatVnIsoDate } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
import type {
  PurchaseReportFilters,
  PurchaseReportSnapshot,
  ReportingSnapshot,
  StaffSalesRow,
  TransactionExportRow,
} from "./types";

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

function fillPurchaseDaily(
  from: string,
  to: string,
  daily: PurchaseReportSnapshot["daily"],
): PurchaseReportSnapshot["daily"] {
  const map = new Map(daily.map((row) => [row.date, row]));
  const filled: PurchaseReportSnapshot["daily"] = [];
  let cursor = from;
  while (cursor <= to) {
    filled.push(
      map.get(cursor) ?? {
        date: cursor,
        purchaseDong: 0,
        sellDong: 0,
        voucherCount: 0,
      },
    );
    cursor = addVnCalendarDays(cursor, 1);
  }
  return filled;
}

export async function getPurchaseReportSnapshot(
  filters: PurchaseReportFilters,
): Promise<PurchaseReportSnapshot> {
  const { from, to } = filters;
  const brandId = filters.brandId?.trim() || null;
  const skuId = filters.skuId?.trim() || null;
  const actorEmail = filters.actorEmail?.trim() || null;

  const supabase = await createServerSupabase();
  const fromIso = `${from}T00:00:00+07:00`;
  const toIso = `${to}T23:59:59.999+07:00`;

  const [{ data: buys, error: buyError }, { data: sales, error: saleError }, brandsRpc, skusRes] =
    await Promise.all([
      supabase
        .from("pos_buys")
        .select(
          "id, buy_no, total_dong, completed_at, actor_email, customer_name_snapshot, pos_buy_items(quantity, total_price_dong, sku_id, brand_id, brand_name, product_name_snapshot, pos_skus(sku, name))",
        )
        .eq("status", "COMPLETED")
        .gte("completed_at", fromIso)
        .lte("completed_at", toIso)
        .order("completed_at", { ascending: false }),
      supabase
        .from("pos_sales")
        .select("total_dong, completed_at, pos_sale_items(quantity)")
        .eq("status", "COMPLETED")
        .gte("completed_at", fromIso)
        .lte("completed_at", toIso),
      supabase.rpc("pos_list_brands"),
      supabase
        .from("pos_skus")
        .select("id, sku, name")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(500),
    ]);

  if (buyError) throw new Error(buyError.message);
  if (saleError) throw new Error(saleError.message);

  type BuyItem = {
    quantity: number;
    total_price_dong: number;
    sku_id: string | null;
    brand_id: string | null;
    brand_name: string | null;
    product_name_snapshot: string | null;
    pos_skus: { sku: string; name: string } | { sku: string; name: string }[] | null;
  };

  const filteredBuys = (buys ?? []).filter((buy) => {
    if (actorEmail && String(buy.actor_email ?? "") !== actorEmail) return false;
    const items = (buy.pos_buy_items ?? []) as BuyItem[];
    if (!brandId && !skuId) return true;
    return items.some((item) => {
      const matchBrand = !brandId || item.brand_id === brandId;
      const matchSku = !skuId || item.sku_id === skuId;
      return matchBrand && matchSku;
    });
  });

  const dailyMap = new Map<string, { purchaseDong: number; sellDong: number; voucherCount: number }>();
  const productMap = new Map<
    string,
    { skuId: string; sku: string; name: string; quantity: number; totalDong: number }
  >();
  const brandMap = new Map<
    string,
    { brandId: string | null; brandName: string; quantity: number; totalDong: number }
  >();
  const staffSet = new Set<string>();
  const history: PurchaseReportSnapshot["history"] = [];

  let totalPurchaseDong = 0;
  let quantityPurchased = 0;
  let voucherCount = 0;

  for (const buy of filteredBuys) {
    const day = formatVnIsoDate(String(buy.completed_at));
    const items = ((buy.pos_buy_items ?? []) as BuyItem[]).filter((item) => {
      const matchBrand = !brandId || item.brand_id === brandId;
      const matchSku = !skuId || item.sku_id === skuId;
      return matchBrand && matchSku;
    });
    if (items.length === 0) continue;

    const buyTotal = brandId || skuId
      ? items.reduce((sum, item) => sum + Number(item.total_price_dong), 0)
      : Number(buy.total_dong);
    const buyQty = items.reduce((sum, item) => sum + Number(item.quantity), 0);

    totalPurchaseDong += buyTotal;
    quantityPurchased += buyQty;
    voucherCount += 1;

    const dayRow = dailyMap.get(day) ?? { purchaseDong: 0, sellDong: 0, voucherCount: 0 };
    dayRow.purchaseDong += buyTotal;
    dayRow.voucherCount += 1;
    dailyMap.set(day, dayRow);

    if (buy.actor_email) staffSet.add(String(buy.actor_email));

    history.push({
      buyNo: String(buy.buy_no),
      completedAt: String(buy.completed_at),
      actorEmail: String(buy.actor_email ?? ""),
      customerName: String(buy.customer_name_snapshot ?? "Khách"),
      totalDong: buyTotal,
      quantity: buyQty,
    });

    for (const item of items) {
      const skuEmbed = Array.isArray(item.pos_skus) ? item.pos_skus[0] : item.pos_skus;
      const key = item.sku_id ?? skuEmbed?.sku ?? item.product_name_snapshot ?? "unknown";
      const current = productMap.get(key) ?? {
        skuId: item.sku_id ?? key,
        sku: skuEmbed?.sku ?? "",
        name: skuEmbed?.name ?? item.product_name_snapshot ?? "Sản phẩm",
        quantity: 0,
        totalDong: 0,
      };
      current.quantity += Number(item.quantity);
      current.totalDong += Number(item.total_price_dong);
      productMap.set(key, current);

      const brandKey = item.brand_id ?? item.brand_name ?? "none";
      const brandRow = brandMap.get(brandKey) ?? {
        brandId: item.brand_id,
        brandName: item.brand_name?.trim() || "Không thương hiệu",
        quantity: 0,
        totalDong: 0,
      };
      brandRow.quantity += Number(item.quantity);
      brandRow.totalDong += Number(item.total_price_dong);
      brandMap.set(brandKey, brandRow);
    }
  }

  let totalSellDong = 0;
  let quantitySold = 0;
  for (const sale of sales ?? []) {
    const day = formatVnIsoDate(String(sale.completed_at));
    const sellTotal = Number(sale.total_dong);
    totalSellDong += sellTotal;
    const items = (sale.pos_sale_items ?? []) as Array<{ quantity: number }>;
    for (const item of items) quantitySold += Number(item.quantity);
    const dayRow = dailyMap.get(day) ?? { purchaseDong: 0, sellDong: 0, voucherCount: 0 };
    dayRow.sellDong += sellTotal;
    dailyMap.set(day, dayRow);
  }

  const brandOptions = Array.isArray(brandsRpc.data)
    ? (brandsRpc.data as Array<{ id: string; name: string }>).map((b) => ({
        id: String(b.id),
        label: String(b.name),
      }))
    : [];

  const productOptions = (skusRes.data ?? []).map((row) => ({
    id: String(row.id),
    label: `${row.sku} - ${row.name}`,
  }));

  return {
    from,
    to,
    totalPurchaseDong,
    quantityPurchased,
    voucherCount,
    totalSellDong,
    quantitySold,
    daily: fillPurchaseDaily(from, to, [...dailyMap.entries()].map(([date, row]) => ({ date, ...row }))),
    topProducts: [...productMap.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
    topBrands: [...brandMap.values()]
      .sort((a, b) => b.totalDong - a.totalDong)
      .slice(0, 10),
    history: history.slice(0, 50),
    filterOptions: {
      brands: brandOptions,
      products: productOptions,
      staff: [...staffSet].sort().map((email) => ({ id: email, label: email })),
    },
  };
}
