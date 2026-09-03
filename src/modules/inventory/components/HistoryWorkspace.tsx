"use client";

import { useEffect, useState, useTransition } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { formatDongCompact } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { downloadCsv } from "@/shared/lib/csv";
import { exportLedger, listBrands, searchLedger } from "../actions";
import { LEDGER_TYPE_OPTIONS, ledgerTypeLabel } from "../labels";
import { NO_BRAND_ID, type BrandOption, type LedgerListPage } from "../types";

export function HistoryWorkspace({ initial }: { initial: LedgerListPage }) {
  const [page, setPage] = useState(initial);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [brandId, setBrandId] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listBrands()
      .then(setBrands)
      .catch(() => setBrands([]));
  }, []);

  function refresh(next?: { offset?: number }) {
    startTransition(async () => {
      try {
        const result = await searchLedger({
          from: from || null,
          to: to || null,
          brandId: brandId || null,
          type: type || null,
          q: q || null,
          limit: 50,
          offset: next?.offset ?? 0,
        });
        setPage(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được lịch sử.");
      }
    });
  }

  async function onExport() {
    try {
      const result = await exportLedger({
        from: from || null,
        to: to || null,
        brandId: brandId || null,
        type: type || null,
        q: q || null,
      });
      downloadCsv(
        "lich-su-bien-dong-kho.csv",
        [
          "Movement ID",
          "Thời gian",
          "Loại",
          "Mã hàng",
          "Sản phẩm",
          "Thương hiệu",
          "SL",
          "Trước",
          "Sau",
          "Giá vốn",
          "Tham chiếu",
          "Người làm",
          "Ghi chú",
        ],
        result.items.map((row) => [
          row.id,
          formatViDateTime(row.createdAt),
          ledgerTypeLabel(row.type),
          row.sku,
          row.name,
          row.brandName || "Không brand",
          row.quantity,
          row.beforeQuantity,
          row.afterQuantity,
          row.costPriceDong == null ? "" : formatDongCompact(row.costPriceDong),
          `${row.referenceType} ${row.referenceId}`,
          row.actorEmail,
          row.reason,
        ]),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xuất được file.");
    }
  }

  const fromRow = page.total === 0 ? 0 : page.offset + 1;
  const toRow = Math.min(page.offset + page.items.length, page.total);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">Kho hàng</h1>
          <p className="text-[12px] text-[var(--tlkv-muted)]">Kho hàng › Lịch sử biến động</p>
        </div>
        <button
          type="button"
          onClick={() => void onExport()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
        >
          <DownloadSimple size={16} />
          Xuất CSV (đúng bộ lọc)
        </button>
      </div>
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <h2 className="text-[15px] font-semibold">Sổ biến động kho</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-label="Từ ngày"
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label="Đến ngày"
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
          <select
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            <option value="">Thương hiệu: Tất cả</option>
            <option value={NO_BRAND_ID}>Không brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
                {brand.isActive ? "" : " (ngừng)"}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            {LEDGER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="SKU, tên, lý do, người làm"
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => refresh({ offset: 0 })}
            className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-semibold"
          >
            Áp dụng lọc
          </button>
        </div>
        {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}
        <div className={`mt-4 overflow-x-auto ${pending ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[1080px] text-left text-[13px]">
            <thead className="text-[12px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 pr-3 font-medium">Thời gian</th>
                <th className="py-2 pr-3 font-medium">Mã hàng</th>
                <th className="py-2 pr-3 font-medium">Thương hiệu</th>
                <th className="py-2 pr-3 font-medium">Loại</th>
                <th className="py-2 pr-3 font-medium">SL</th>
                <th className="py-2 pr-3 font-medium">Trước → Sau</th>
                <th className="py-2 pr-3 font-medium">Giá vốn</th>
                <th className="py-2 pr-3 font-medium">Lý do</th>
                <th className="py-2 font-medium">Người làm</th>
              </tr>
            </thead>
            <tbody>
              {page.items.length === 0 ? (
                <tr>
                  <td className="py-4 text-[var(--tlkv-muted)]" colSpan={9}>
                    Không có biến động khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                page.items.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-3 pr-3">{formatViDateTime(row.createdAt)}</td>
                    <td className="py-3 pr-3">
                      {row.sku} · {row.name}
                    </td>
                    <td className="py-3 pr-3">{row.brandName || "Không brand"}</td>
                    <td className="py-3 pr-3">{ledgerTypeLabel(row.type)}</td>
                    <td className="py-3 pr-3 font-medium">{row.quantity}</td>
                    <td className="py-3 pr-3">
                      {row.beforeQuantity} → {row.afterQuantity}
                    </td>
                    <td className="py-3 pr-3">
                      {row.costPriceDong == null ? "—" : formatDongCompact(row.costPriceDong)}
                    </td>
                    <td className="py-3 pr-3">{row.reason}</td>
                    <td className="py-3">{row.actorEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--tlkv-muted)]">
          <p>
            Hiển thị {fromRow} - {toRow} trong {page.total}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page.offset === 0}
              onClick={() => refresh({ offset: Math.max(0, page.offset - page.limit) })}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={page.offset + page.items.length >= page.total}
              onClick={() => refresh({ offset: page.offset + page.limit })}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
