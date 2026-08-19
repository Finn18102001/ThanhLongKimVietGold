import { BestSellers } from "./components/BestSellers";
import { KpiRow } from "./components/KpiRow";
import { QuickActions } from "./components/QuickActions";
import { RecentInvoices } from "./components/RecentInvoices";
import { RevenueChart } from "./components/RevenueChart";
import { StockAlerts } from "./components/StockAlerts";
import { getDashboardSnapshot } from "./query";

export async function DashboardPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <div className="flex flex-col gap-4">
      {snapshot.isPreview ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-[13px] text-amber-800">
          Bảng điều khiển đang hiển thị số liệu minh họa. Số thật sẽ hiện khi hệ thống đã có đơn
          bán hoàn tất.
        </p>
      ) : null}

      <KpiRow items={snapshot.kpis} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <RevenueChart series={snapshot.revenueSeries} />
        </div>
        <BestSellers items={snapshot.bestSellers} />
        <StockAlerts items={snapshot.stockAlerts} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
        <RecentInvoices items={snapshot.recentInvoices} />
        <QuickActions />
      </div>
    </div>
  );
}
