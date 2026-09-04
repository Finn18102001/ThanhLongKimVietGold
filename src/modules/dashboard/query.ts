import { formatDong } from "@/shared/lib/money";
import { addVnCalendarDays, formatVnIsoDate } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
import { formatTrendHint, trendFrom } from "./trend";
import type { DashboardSnapshot } from "./types";

type DashboardRpc = {
  isPreview: boolean;
  businessDate: string;
  kpis: {
    revenueToday: number;
    revenueYesterday: number;
    soldToday: number;
    soldYesterday: number;
    stockQty: number;
    invoicesToday: number;
    invoicesYesterday: number;
  };
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_dashboard");
  if (error) {
    throw new Error(error.message);
  }

  const rpc = data as DashboardRpc;
  const revenueTrend = trendFrom(rpc.kpis.revenueToday, rpc.kpis.revenueYesterday);
  const soldTrend = trendFrom(rpc.kpis.soldToday, rpc.kpis.soldYesterday);
  const invoiceTrend = trendFrom(rpc.kpis.invoicesToday, rpc.kpis.invoicesYesterday);

  const rangeStart = addVnCalendarDays(rpc.businessDate, -6);
  const rangeEnd = rpc.businessDate;
  const fromIso = `${rangeStart}T00:00:00+07:00`;
  const yesterday = addVnCalendarDays(rpc.businessDate, -1);
  const yesterdayStart = `${yesterday}T00:00:00+07:00`;
  const yesterdayEnd = `${yesterday}T23:59:59.999+07:00`;

  const [
    { data: sales },
    { data: stockRows },
    { data: invoices },
    { data: buys },
    { data: buysYesterday },
  ] = await Promise.all([
    supabase
      .from("pos_sales")
      .select("id, total_dong, completed_at, pos_sale_items(quantity, total_price_dong, pos_skus(name))")
      .eq("status", "COMPLETED")
      .gte("completed_at", fromIso)
      .order("completed_at", { ascending: true }),
    supabase
      .from("pos_inventory_stock")
      .select("quantity, pos_skus(name, sku)")
      .lte("quantity", 3)
      .order("quantity", { ascending: true })
      .limit(6),
    supabase
      .from("pos_invoices")
      .select(
        "invoice_no, total_dong, issued_at, status, pos_customers(name), pos_sales(payment_method, actor_email)",
      )
      .order("issued_at", { ascending: false })
      .limit(5),
    supabase
      .from("pos_buys")
      .select("id, total_dong, completed_at, pos_buy_items(quantity)")
      .eq("status", "COMPLETED")
      .gte("completed_at", fromIso)
      .order("completed_at", { ascending: true }),
    supabase
      .from("pos_buys")
      .select("id, total_dong, pos_buy_items(quantity)")
      .eq("status", "COMPLETED")
      .gte("completed_at", yesterdayStart)
      .lte("completed_at", yesterdayEnd),
  ]);

  const seriesMap = new Map<string, { sell: number; buy: number }>();
  for (let i = 0; i < 7; i += 1) {
    const key = addVnCalendarDays(rangeStart, i);
    seriesMap.set(key, { sell: 0, buy: 0 });
  }
  const bestMap = new Map<string, { name: string; quantitySold: number; revenueDong: number }>();

  for (const sale of sales ?? []) {
    const day = formatVnIsoDate(String(sale.completed_at));
    const point = seriesMap.get(day);
    if (point) {
      point.sell += Number(sale.total_dong);
    }
    const items = (sale.pos_sale_items ?? []) as Array<{
      quantity: number;
      total_price_dong: number;
      pos_skus: { name: string } | { name: string }[] | null;
    }>;
    for (const item of items) {
      const skuName = Array.isArray(item.pos_skus)
        ? item.pos_skus[0]?.name
        : item.pos_skus?.name;
      if (!skuName) continue;
      const current = bestMap.get(skuName) ?? {
        name: skuName,
        quantitySold: 0,
        revenueDong: 0,
      };
      current.quantitySold += Number(item.quantity);
      current.revenueDong += Number(item.total_price_dong);
      bestMap.set(skuName, current);
    }
  }

  let purchaseTodayDong = 0;
  let purchaseTodayQty = 0;
  let purchaseTodayVouchers = 0;

  for (const buy of buys ?? []) {
    const day = formatVnIsoDate(String(buy.completed_at));
    const point = seriesMap.get(day);
    const total = Number(buy.total_dong);
    if (point) {
      point.buy += total;
    }
    if (day === rangeEnd) {
      purchaseTodayDong += total;
      purchaseTodayVouchers += 1;
      const items = (buy.pos_buy_items ?? []) as Array<{ quantity: number }>;
      for (const item of items) {
        purchaseTodayQty += Number(item.quantity);
      }
    }
  }

  let purchaseYesterdayDong = 0;
  for (const buy of buysYesterday ?? []) {
    purchaseYesterdayDong += Number(buy.total_dong);
  }
  const purchaseTrend = trendFrom(purchaseTodayDong, purchaseYesterdayDong);

  const paymentLabel: Record<string, string> = {
    CASH: "Tiền mặt",
    TRANSFER: "Chuyển khoản",
    CARD: "Thẻ",
  };

  return {
    isPreview: false,
    businessDate: rpc.businessDate,
    purchaseToday: {
      totalDong: purchaseTodayDong,
      quantity: purchaseTodayQty,
      voucherCount: purchaseTodayVouchers,
    },
    kpis: [
      {
        id: "revenue",
        label: "Doanh thu hôm nay",
        valueLabel: formatDong(Number(rpc.kpis.revenueToday)),
        ...revenueTrend,
        hint: formatTrendHint(revenueTrend.trendDirection),
      },
      {
        id: "sold",
        label: "Số sản phẩm đã bán",
        valueLabel: String(rpc.kpis.soldToday),
        ...soldTrend,
        hint: formatTrendHint(soldTrend.trendDirection),
      },
      {
        id: "stock",
        label: "Tồn kho",
        valueLabel: new Intl.NumberFormat("vi-VN").format(Number(rpc.kpis.stockQty)),
        trendPercent: null,
        trendDirection: "flat",
        hint: "tồn hiện tại",
      },
      {
        id: "invoices",
        label: "Số hóa đơn",
        valueLabel: String(rpc.kpis.invoicesToday),
        ...invoiceTrend,
        hint: formatTrendHint(invoiceTrend.trendDirection),
      },
      {
        id: "purchaseValue",
        label: "Giá trị mua hôm nay",
        valueLabel: formatDong(purchaseTodayDong),
        ...purchaseTrend,
        hint: formatTrendHint(purchaseTrend.trendDirection),
      },
      {
        id: "purchaseQty",
        label: "Sản phẩm nhập hôm nay",
        valueLabel: String(purchaseTodayQty),
        trendPercent: null,
        trendDirection: "flat",
        hint: "theo phiếu mua hoàn tất",
      },
      {
        id: "purchaseVouchers",
        label: "Phiếu mua hôm nay",
        valueLabel: String(purchaseTodayVouchers),
        trendPercent: null,
        trendDirection: "flat",
        hint: "số phiếu mua",
      },
    ],
    revenueSeries: [...seriesMap.entries()].map(([isoDate, amounts]) => ({
      isoDate,
      label: `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`,
      amountDong: amounts.sell,
      purchaseDong: amounts.buy,
      isCurrent: isoDate === rangeEnd,
    })),
    bestSellers: [...bestMap.values()]
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5)
      .map((item, index) => ({ rank: index + 1, ...item })),
    stockAlerts: (stockRows ?? []).map((row) => {
      const sku = Array.isArray(row.pos_skus) ? row.pos_skus[0] : row.pos_skus;
      return {
        productName: sku?.name ?? "SKU",
        sku: sku?.sku ?? "",
        quantity: Number(row.quantity),
        level: "low" as const,
      };
    }),
    recentInvoices: (invoices ?? []).map((invoice) => {
      const customer = Array.isArray(invoice.pos_customers)
        ? invoice.pos_customers[0]
        : invoice.pos_customers;
      const sale = Array.isArray(invoice.pos_sales) ? invoice.pos_sales[0] : invoice.pos_sales;
      return {
        id: invoice.invoice_no as string,
        customerName: customer?.name ?? "Khách lẻ",
        totalDong: Number(invoice.total_dong),
        paymentMethod: paymentLabel[sale?.payment_method ?? ""] ?? sale?.payment_method ?? "",
        issuedAt: invoice.issued_at as string,
        staffName: sale?.actor_email ?? "",
        status: "COMPLETED" as const,
      };
    }),
  };
}
