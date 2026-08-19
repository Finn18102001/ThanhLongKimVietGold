import { formatDong } from "@/shared/lib/money";
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

  const from = new Date(`${rpc.businessDate}T00:00:00+07:00`);
  from.setDate(from.getDate() - 6);
  const fromIso = from.toISOString();

  const [{ data: sales }, { data: stockRows }, { data: invoices }] = await Promise.all([
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
  ]);

  const seriesMap = new Map<string, number>();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    seriesMap.set(key, 0);
  }
  const bestMap = new Map<string, { name: string; quantitySold: number; revenueDong: number }>();

  for (const sale of sales ?? []) {
    const day = String(sale.completed_at).slice(0, 10);
    seriesMap.set(day, (seriesMap.get(day) ?? 0) + Number(sale.total_dong));
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

  const paymentLabel: Record<string, string> = {
    CASH: "Tiền mặt",
    TRANSFER: "Chuyển khoản",
    CARD: "Thẻ",
  };

  return {
    isPreview: false,
    businessDate: rpc.businessDate,
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
    ],
    revenueSeries: [...seriesMap.entries()].map(([isoDate, amountDong]) => ({
      isoDate,
      label: `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`,
      amountDong,
      isCurrent: isoDate === rpc.businessDate,
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
