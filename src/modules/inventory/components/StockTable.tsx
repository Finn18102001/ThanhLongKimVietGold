"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { STOCK_STATUS_LABEL } from "../labels";
import { stockStatus, type StockFilter, type StockRow } from "../types";

const PAGE_SIZE = 8;

const TABS: { id: StockFilter; label: string }[] = [
  { id: "ALL", label: "Tất cả" },
  { id: "IN_STOCK", label: "Còn hàng" },
  { id: "LOW_STOCK", label: "Sắp hết hàng" },
  { id: "OUT_OF_STOCK", label: "Hết hàng" },
];

export function StockTable({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<StockFilter>("ALL");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [page, setPage] = useState(0);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))),
    [rows],
  );

  const brands = useMemo(
    () => Array.from(new Set(rows.map((row) => row.brandName).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const status = stockStatus(row.quantity);
      const matchesTab = tab === "ALL" || status === tab;
      const matchesCategory = !category || row.category === category;
      const matchesBrand =
        !brand ||
        (brand === "__none__" ? !row.brandName : row.brandName === brand);
      const matchesQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        (row.brandName ?? "").toLowerCase().includes(q);
      return matchesTab && matchesCategory && matchesBrand && matchesQuery;
    });
  }, [rows, query, tab, category, brand]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Tồn kho hiện tại</h2>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setPage(0);
            }}
            className={`h-9 rounded-full px-3 text-[13px] font-medium ${
              tab === item.id
                ? "bg-[var(--tlkv-red)] text-white"
                : "bg-[var(--tlkv-bg)] hover:bg-[var(--tlkv-red-soft)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="relative min-w-[220px] flex-1">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
          />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Tìm sản phẩm, mã hàng..."
            className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(0);
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        >
          <option value="">Tất cả danh mục</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value);
            setPage(0);
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        >
          <option value="">Tất cả thương hiệu</option>
          <option value="__none__">Không brand</option>
          {brands.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1020px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-3 font-medium">Sản phẩm</th>
              <th className="py-2 pr-3 font-medium">Mã hàng</th>
              <th className="py-2 pr-3 font-medium">Thương hiệu</th>
              <th className="py-2 pr-3 font-medium">Danh mục</th>
              <th className="py-2 pr-3 font-medium">SL tồn</th>
              <th className="py-2 pr-3 font-medium">TL / chiếc</th>
              <th className="py-2 pr-3 font-medium">Tổng TL</th>
              <th className="py-2 pr-3 font-medium">Giá hiện tại</th>
              <th className="py-2 pr-3 font-medium">Giá vốn gần nhất</th>
              <th className="py-2 pr-3 font-medium">Giá trị tồn</th>
              <th className="py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td className="py-6 text-[var(--tlkv-muted)]" colSpan={11}>
                  Không có mã hàng khớp bộ lọc.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const status = stockStatus(row.quantity);
                const value =
                  row.unitPriceDong === null ? null : row.unitPriceDong * row.quantity;
                return (
                  <tr key={row.skuId} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <span className="relative h-11 w-11 overflow-hidden rounded-lg bg-[var(--tlkv-bg)]">
                          {row.imageUrl ? (
                            <Image
                              src={row.imageUrl}
                              alt={row.name}
                              fill
                              unoptimized
                              sizes="44px"
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[12px] font-semibold text-[var(--tlkv-muted)]">
                              {row.name.slice(0, 1)}
                            </span>
                          )}
                        </span>
                        <span className="block font-medium">{row.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-semibold text-[var(--tlkv-red)]">{row.sku}</td>
                    <td className="py-3 pr-3">{row.brandName || "Không brand"}</td>
                    <td className="py-3 pr-3">{row.category}</td>
                    <td className="py-3 pr-3 font-medium tabular-nums">{row.quantity}</td>
                    <td className="py-3 pr-3 tabular-nums text-[var(--tlkv-muted)]">
                      {row.weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ
                    </td>
                    <td className="py-3 pr-3 font-semibold tabular-nums">
                      {(row.quantity * row.weightChi).toLocaleString("vi-VN", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      chỉ
                    </td>
                    <td className="py-3 pr-3">
                      {row.unitPriceDong === null ? "Chưa gắn bảng giá" : formatDong(row.unitPriceDong)}
                    </td>
                    <td className="py-3 pr-3">
                      {row.lastCostDong == null ? "—" : formatDong(row.lastCostDong)}
                    </td>
                    <td className="py-3 pr-3 font-medium">
                      {value === null ? "-" : formatDong(value)}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--tlkv-muted)]">
        <p>
          Hiển thị {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1} -{" "}
          {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} trong {filtered.length}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Trước
          </button>
          <button
            type="button"
            disabled={safePage + 1 >= pageCount}
            onClick={() => setPage(safePage + 1)}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof stockStatus> }) {
  const className =
    status === "IN_STOCK"
      ? "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
      : status === "LOW_STOCK"
        ? "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
        : "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {STOCK_STATUS_LABEL[status]}
    </span>
  );
}
