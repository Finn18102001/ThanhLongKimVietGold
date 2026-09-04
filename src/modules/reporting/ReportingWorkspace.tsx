"use client";

import { useEffect, useState, useTransition } from "react";
import { Printer } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import {
  fetchPurchaseReport,
  fetchReportingSnapshot,
  fetchStaffSalesReport,
  fetchTransactionExport,
} from "./actions";
import type {
  PurchaseReportSnapshot,
  ReportingSnapshot,
  StaffSalesRow,
  TransactionExportRow,
} from "./types";

export function ReportingWorkspace({
  initial,
  initialPurchase,
}: {
  initial: ReportingSnapshot;
  initialPurchase: PurchaseReportSnapshot;
}) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [snapshot, setSnapshot] = useState(initial);
  const [purchase, setPurchase] = useState(initialPurchase);
  const [purchaseBrandId, setPurchaseBrandId] = useState("");
  const [purchaseSkuId, setPurchaseSkuId] = useState("");
  const [purchaseActor, setPurchaseActor] = useState("");
  const [staffRows, setStaffRows] = useState<StaffSalesRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const maxRevenue = Math.max(...snapshot.daily.map((row) => row.revenueDong), 1);
  const maxPurchaseDaily = Math.max(
    ...purchase.daily.map((row) => Math.max(row.purchaseDong, row.sellDong)),
    1,
  );

  function refresh(nextFrom = from, nextTo = to) {
    startTransition(async () => {
      try {
        const [nextSnapshot, nextStaff, nextPurchase] = await Promise.all([
          fetchReportingSnapshot(nextFrom, nextTo),
          fetchStaffSalesReport(nextFrom, nextTo),
          fetchPurchaseReport({
            from: nextFrom,
            to: nextTo,
            brandId: purchaseBrandId || null,
            skuId: purchaseSkuId || null,
            actorEmail: purchaseActor || null,
          }),
        ]);
        setSnapshot(nextSnapshot);
        setStaffRows(nextStaff);
        setPurchase(nextPurchase);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải báo cáo");
      }
    });
  }

  function refreshPurchase(
    nextFrom = from,
    nextTo = to,
    brandId = purchaseBrandId,
    skuId = purchaseSkuId,
    actorEmail = purchaseActor,
  ) {
    startTransition(async () => {
      try {
        const nextPurchase = await fetchPurchaseReport({
          from: nextFrom,
          to: nextTo,
          brandId: brandId || null,
          skuId: skuId || null,
          actorEmail: actorEmail || null,
        });
        setPurchase(nextPurchase);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải báo cáo mua hàng");
      }
    });
  }

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        const rows = await fetchStaffSalesReport(initial.from, initial.to);
        if (!cancelled) {
          setStaffRows(rows);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Không tải doanh số nhân viên");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initial.from, initial.to, startTransition]);

  async function exportTransactions() {
    setExporting(true);
    try {
      const rows = await fetchTransactionExport(from, to);
      downloadTransactionsCsv(rows, from, to);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xuất được Excel giao dịch");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-[18px] font-semibold">Báo cáo doanh thu</h1>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Chỉ tính các đơn bán đã hoàn tất. Trừ các phiếu trả hàng đã xử lý xong. Số liệu lấy
              trực tiếp từ hệ thống, không nhập tay.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => refresh()}
              className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
            >
              Lọc
            </button>
            <button
              type="button"
              disabled={exporting || pending}
              onClick={() => void exportTransactions()}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] font-medium"
            >
              {exporting ? "Đang xuất..." : "Xuất Excel giao dịch"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <Printer size={16} />
              In / PDF
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}

        <div className={`mt-4 grid grid-cols-1 gap-3 md:grid-cols-4 ${pending ? "opacity-60" : ""}`}>
          <Kpi label="Doanh thu trước hoàn" value={formatDong(snapshot.totalRevenueDong)} />
          <Kpi label="Số hóa đơn" value={String(snapshot.invoiceCount)} />
          <Kpi label="TB / hóa đơn" value={formatDong(snapshot.avgInvoiceDong)} />
          <Kpi
            label="Doanh thu sau hoàn"
            value={formatDong(snapshot.netRevenueDong)}
            hint={`Đã trừ hoàn: ${formatDong(snapshot.returnsTotalDong)}`}
          />
        </div>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <h2 className="text-[15px] font-semibold">Doanh thu theo ngày</h2>
        <div className="mt-4 flex h-[192px] items-end gap-2">
          {snapshot.daily.length === 0 ? (
            <p className="text-[13px] text-[var(--tlkv-muted)]">Không có dữ liệu trong khoảng thời gian.</p>
          ) : (
            snapshot.daily.map((row) => {
              const height = Math.max(8, Math.round((row.revenueDong / maxRevenue) * 160));
              return (
                <div key={row.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full max-w-10 rounded-t-md bg-[var(--tlkv-red)]"
                    style={{ height }}
                    title={formatDong(row.revenueDong)}
                  />
                  <span className="text-[10px] text-[var(--tlkv-muted)]">
                    {row.date.slice(8, 10)}/{row.date.slice(5, 7)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <h2 className="text-[15px] font-semibold">Top sản phẩm bán chạy</h2>
        <table className="mt-3 w-full text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Mã hàng</th>
              <th className="py-2 font-medium">Sản phẩm</th>
              <th className="py-2 font-medium">SL bán</th>
              <th className="py-2 font-medium">Số chỉ</th>
              <th className="py-2 text-right font-medium">Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.topProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-[var(--tlkv-muted)]">
                  Chưa có dữ liệu bán.
                </td>
              </tr>
            ) : (
              snapshot.topProducts.map((row) => (
                <tr key={row.sku} className="border-b border-[var(--tlkv-line)]">
                  <td className="py-2.5">{row.sku}</td>
                  <td className="py-2.5 font-medium">{row.name}</td>
                  <td className="py-2.5 tabular-nums">{row.quantitySold}</td>
                  <td className="py-2.5 tabular-nums">
                    {row.weightChiSold.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} chỉ
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{formatDong(row.revenueDong)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <h2 className="text-[15px] font-semibold">Doanh số nhân viên</h2>
        <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
          Theo khoảng ngày đang lọc. Chỉ Admin mới xem được số liệu này.
        </p>
        <table className={`mt-3 w-full text-left text-[13px] ${pending ? "opacity-60" : ""}`}>
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Nhân viên</th>
              <th className="py-2 font-medium">Số hóa đơn</th>
              <th className="py-2 text-right font-medium">Doanh thu</th>
              <th className="py-2 text-right font-medium">Đã thu</th>
              <th className="py-2 text-right font-medium">Còn lại</th>
            </tr>
          </thead>
          <tbody>
            {staffRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-[var(--tlkv-muted)]">
                  Chưa có doanh số trong khoảng này.
                </td>
              </tr>
            ) : (
              staffRows.map((row) => (
                <tr key={row.actorEmail} className="border-b border-[var(--tlkv-line)]">
                  <td className="py-2.5 font-medium">
                    {row.actorEmail.split("@")[0] ?? row.actorEmail}
                  </td>
                  <td className="py-2.5 tabular-nums">{row.invoiceCount}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatDong(row.grossDong)}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatDong(row.collectedDong)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatDong(row.remainingDong)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)] print:shadow-none">
        <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
          <div>
            <h2 className="text-[18px] font-semibold">Báo cáo Mua hàng / Nhập hàng</h2>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Theo dõi giá trị nhập, số lượng nhập và đối chiếu với bán hàng trong cùng khoảng ngày.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={purchaseBrandId}
              onChange={(e) => setPurchaseBrandId(e.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả thương hiệu</option>
              {purchase.filterOptions.brands.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={purchaseSkuId}
              onChange={(e) => setPurchaseSkuId(e.target.value)}
              className="h-10 max-w-[220px] rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả sản phẩm</option>
              {purchase.filterOptions.products.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={purchaseActor}
              onChange={(e) => setPurchaseActor(e.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả nhân viên</option>
              {purchase.filterOptions.staff.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() => refreshPurchase()}
              className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
            >
              Lọc mua hàng
            </button>
          </div>
        </div>

        <div className={`mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 ${pending ? "opacity-60" : ""}`}>
          <Kpi label="Tổng giá trị nhập" value={formatDong(purchase.totalPurchaseDong)} />
          <Kpi label="Tổng sản phẩm nhập" value={String(purchase.quantityPurchased)} />
          <Kpi label="Số phiếu mua hàng" value={String(purchase.voucherCount)} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[var(--tlkv-line)] px-4 py-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">MUA HÀNG</p>
            <p className="mt-2 text-[15px] font-semibold">
              Tổng giá trị nhập: {formatDong(purchase.totalPurchaseDong)}
            </p>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Số lượng nhập: {purchase.quantityPurchased} sản phẩm
            </p>
          </div>
          <div className="rounded-lg border border-[var(--tlkv-line)] px-4 py-3">
            <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">BÁN HÀNG</p>
            <p className="mt-2 text-[15px] font-semibold">
              Tổng giá trị bán: {formatDong(purchase.totalSellDong)}
            </p>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Số lượng bán: {purchase.quantitySold} sản phẩm
            </p>
          </div>
        </div>

        <h3 className="mt-5 text-[14px] font-semibold">Giá trị mua / bán theo ngày</h3>
        <div className="mt-3 flex h-[160px] items-end gap-2">
          {purchase.daily.map((row) => {
            const buyH = Math.max(4, Math.round((row.purchaseDong / maxPurchaseDaily) * 130));
            const sellH = Math.max(4, Math.round((row.sellDong / maxPurchaseDaily) * 130));
            return (
              <div key={row.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex w-full max-w-10 items-end justify-center gap-0.5">
                  <div
                    className="w-[45%] rounded-t-md bg-[var(--tlkv-amber)]"
                    style={{ height: buyH }}
                    title={`Mua: ${formatDong(row.purchaseDong)}`}
                  />
                  <div
                    className="w-[45%] rounded-t-md bg-[var(--tlkv-red)]"
                    style={{ height: sellH }}
                    title={`Bán: ${formatDong(row.sellDong)}`}
                  />
                </div>
                <span className="text-[10px] text-[var(--tlkv-muted)]">
                  {row.date.slice(8, 10)}/{row.date.slice(5, 7)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <h3 className="text-[14px] font-semibold">Sản phẩm nhập nhiều</h3>
            <table className="mt-2 w-full text-left text-[13px]">
              <thead className="text-[12px] text-[var(--tlkv-muted)]">
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className="py-2 font-medium">Mã</th>
                  <th className="py-2 font-medium">Sản phẩm</th>
                  <th className="py-2 text-right font-medium">SL</th>
                  <th className="py-2 text-right font-medium">Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {purchase.topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-[var(--tlkv-muted)]">
                      Chưa có dữ liệu mua.
                    </td>
                  </tr>
                ) : (
                  purchase.topProducts.map((row) => (
                    <tr key={row.skuId} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2 font-mono text-[12px]">{row.sku}</td>
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 text-right tabular-nums">{row.quantity}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatDong(row.totalDong)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold">Thương hiệu nhập nhiều</h3>
            <table className="mt-2 w-full text-left text-[13px]">
              <thead className="text-[12px] text-[var(--tlkv-muted)]">
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className="py-2 font-medium">Thương hiệu</th>
                  <th className="py-2 text-right font-medium">SL</th>
                  <th className="py-2 text-right font-medium">Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {purchase.topBrands.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-[var(--tlkv-muted)]">
                      Chưa có dữ liệu mua.
                    </td>
                  </tr>
                ) : (
                  purchase.topBrands.map((row) => (
                    <tr
                      key={row.brandId ?? row.brandName}
                      className="border-b border-[var(--tlkv-line)]"
                    >
                      <td className="py-2">{row.brandName}</td>
                      <td className="py-2 text-right tabular-nums">{row.quantity}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatDong(row.totalDong)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <h3 className="mt-5 text-[14px] font-semibold">Lịch sử giao dịch mua hàng</h3>
        <table className="mt-2 w-full text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Mã phiếu</th>
              <th className="py-2 font-medium">Khách</th>
              <th className="py-2 font-medium">Nhân viên</th>
              <th className="py-2 text-right font-medium">SL</th>
              <th className="py-2 text-right font-medium">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {purchase.history.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-[var(--tlkv-muted)]">
                  Chưa có phiếu mua trong khoảng lọc.
                </td>
              </tr>
            ) : (
              purchase.history.map((row) => (
                <tr key={row.buyNo} className="border-b border-[var(--tlkv-line)]">
                  <td className="py-2 font-mono text-[12px]">{row.buyNo}</td>
                  <td className="py-2">{row.customerName}</td>
                  <td className="py-2">{row.actorEmail.split("@")[0] ?? row.actorEmail}</td>
                  <td className="py-2 text-right tabular-nums">{row.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{formatDong(row.totalDong)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-[var(--tlkv-bg)] px-4 py-3">
      <p className="text-[12px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-1 text-[20px] font-bold">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">{hint}</p> : null}
    </div>
  );
}

const TYPE_LABEL: Record<TransactionExportRow["type"], string> = {
  SELL: "Bán",
  BUY: "Mua vào",
};

function downloadTransactionsCsv(rows: TransactionExportRow[], from: string, to: string) {
  const header = [
    "Loại",
    "Mã phiếu",
    "Số hóa đơn",
    "Khách hàng",
    "SĐT",
    "Tổng tiền",
    "Đã thanh toán",
    "Còn lại",
    "Trạng thái TT",
    "Hình thức TT",
    "Hạn thanh toán",
    "Nhân viên",
    "Hoàn tất lúc",
  ];
  const lines = rows.map((row) =>
    [
      TYPE_LABEL[row.type],
      row.code,
      row.invoiceNo ?? "",
      row.customerName,
      row.customerPhone,
      row.totalDong,
      row.paidDong,
      row.remainingDong,
      row.paymentStatus,
      row.paymentMethod ?? "",
      row.dueDate ?? "",
      row.actorEmail,
      row.completedAt,
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(","),
  );
  const csv = `\uFEFF${[header.join(","), ...lines].join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const fromStamp = from.replaceAll("-", "");
  const toStamp = to.replaceAll("-", "");
  anchor.download = `tlkv-giao-dich-${fromStamp}-${toStamp}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
