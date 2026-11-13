"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { downloadCsv } from "@/shared/lib/csv";
import { STOCK_STATUS_LABEL } from "../labels";
import { stockStatus, type ProductTypeOption, type StockFilter, type StockRow } from "../types";

const PAGE_SIZE = 8;

/** Text columns wrap (full text); numbers / badges stay on one line, right-aligned. */
const TH = "px-2 py-2.5 align-bottom font-medium leading-snug";
const TD = "px-2 py-3 align-middle";
const NUM = "text-right tabular-nums whitespace-nowrap";

const TABS: { id: StockFilter; label: string }[] = [
  { id: "ALL", label: "Tất cả" },
  { id: "IN_STOCK", label: "Còn hàng" },
  { id: "LOW_STOCK", label: "Sắp hết hàng" },
  { id: "OUT_OF_STOCK", label: "Hết hàng" },
];

export function StockTable({
  rows,
  productTypes = [],
}: {
  rows: StockRow[];
  productTypes?: ProductTypeOption[];
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<StockFilter>("ALL");
  const [category, setCategory] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [brand, setBrand] = useState("");
  const [page, setPage] = useState(0);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))),
    [rows],
  );

  const brands = useMemo(
    () =>
      (Array.from(new Set(rows.map((row) => row.brandName).filter(Boolean))) as string[]).sort(
        (a, b) => a.localeCompare(b, "vi"),
      ),
    [rows],
  );
  const hasNoBrand = useMemo(() => rows.some((row) => !row.brandName), [rows]);
  const brandChips = [
    { id: "", label: "Tất cả" },
    ...brands.map((name) => ({ id: name, label: name })),
    ...(hasNoBrand ? [{ id: "__none__", label: "Không brand" }] : []),
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const status = stockStatus(row.quantity);
      const matchesTab = tab === "ALL" || status === tab;
      const matchesCategory = !category || row.category === category;
      const matchesType =
        !productTypeId ||
        (productTypeId === "__none__" ? !row.productTypeId : row.productTypeId === productTypeId);
      const matchesBrand =
        !brand ||
        (brand === "__none__" ? !row.brandName : row.brandName === brand);
      const matchesQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        (row.brandName ?? "").toLowerCase().includes(q);
      return matchesTab && matchesCategory && matchesType && matchesBrand && matchesQuery;
    });
  }, [rows, query, tab, category, productTypeId, brand]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function onExportExcel() {
    downloadCsv(
      "ton-kho.csv",
      [
        "Mã hàng",
        "Sản phẩm",
        "Thương hiệu",
        "Danh mục",
        "Hàm lượng",
        "SL tồn",
        "TL / chiếc (chỉ)",
        "Tổng TL (chỉ)",
        "Giá hiện tại (đ)",
        "Giá vốn gần nhất (đ)",
        "Giá trị tồn (đ)",
        "Trạng thái",
      ],
      filtered.map((row) => {
        const status = stockStatus(row.quantity);
        const value = row.unitPriceDong === null ? null : row.unitPriceDong * row.quantity;
        return [
          row.sku,
          row.name,
          row.brandName || "Không brand",
          row.category,
          row.purity ?? "",
          row.quantity,
          row.weightChi,
          Number((row.quantity * row.weightChi).toFixed(4)),
          row.unitPriceDong,
          row.lastCostDong,
          value,
          STOCK_STATUS_LABEL[status],
        ];
      }),
    );
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Tồn kho hiện tại</h2>
        <button
          type="button"
          onClick={onExportExcel}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium hover:bg-[var(--tlkv-bg)]"
        >
          <DownloadSimple size={15} weight="bold" />
          Xuất Excel
        </button>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {brandChips.map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            onClick={() => {
              setBrand(item.id);
              setPage(0);
            }}
            className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-medium whitespace-nowrap ${
              brand === item.id
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
          value={productTypeId}
          onChange={(event) => {
            setProductTypeId(event.target.value);
            setPage(0);
          }}
          aria-label="Loại sản phẩm"
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        >
          <option value="">Tất cả loại sản phẩm</option>
          {productTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
          <option value="__none__">Chưa phân loại</option>
        </select>
        <select
          value={tab}
          onChange={(event) => {
            setTab(event.target.value as StockFilter);
            setPage(0);
          }}
          aria-label="Trạng thái tồn kho"
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
        >
          {TABS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id === "ALL" ? "Tất cả trạng thái" : item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1224px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col />
            <col className="w-[118px]" />
            <col className="w-[100px]" />
            <col className="w-[100px]" />
            <col className="w-[58px]" />
            <col className="w-[86px]" />
            <col className="w-[80px]" />
            <col className="w-[132px]" />
            <col className="w-[132px]" />
            <col className="w-[132px]" />
            <col className="w-[110px]" />
          </colgroup>
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className={`${TH} sticky left-0 z-[1] bg-white pl-0`}>Sản phẩm</th>
              <th className={TH}>Mã hàng</th>
              <th className={TH}>Thương hiệu</th>
              <th className={TH}>Danh mục</th>
              <th className={`${TH} text-right`}>SL tồn</th>
              <th className={`${TH} text-right`}>TL / chiếc</th>
              <th className={`${TH} text-right`}>Tổng TL</th>
              <th className={`${TH} text-right`}>Giá hiện tại</th>
              <th className={`${TH} text-right`}>Giá vốn gần nhất</th>
              <th className={`${TH} text-right`}>Giá trị tồn</th>
              <th className={`${TH} pr-0 text-center`}>Trạng thái</th>
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
                    <td className={`${TD} sticky left-0 z-[1] bg-white pl-0`}>
                      <div className="flex items-center gap-3">
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[var(--tlkv-bg)]">
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
                        <span className="min-w-0 font-medium leading-snug [overflow-wrap:anywhere]">
                          {row.name}
                        </span>
                      </div>
                    </td>
                    <td className={`${TD} font-semibold leading-snug text-[var(--tlkv-red)] [overflow-wrap:anywhere]`}>
                      {row.sku}
                    </td>
                    <td className={`${TD} leading-snug [overflow-wrap:anywhere]`}>
                      {row.brandName || "Không brand"}
                    </td>
                    <td className={`${TD} leading-snug [overflow-wrap:anywhere]`}>{row.category}</td>
                    <td className={`${TD} ${NUM} font-medium`}>{row.quantity}</td>
                    <td className={`${TD} ${NUM} text-[var(--tlkv-muted)]`}>
                      {row.weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ
                    </td>
                    <td className={`${TD} ${NUM} font-semibold`}>
                      {(row.quantity * row.weightChi).toLocaleString("vi-VN", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      chỉ
                    </td>
                    <td className={`${TD} text-right`}>
                      {row.unitPriceDong === null ? (
                        <span className="text-[12px] leading-snug text-[var(--tlkv-muted)]">
                          Chưa gắn bảng giá
                        </span>
                      ) : (
                        <span className="tabular-nums whitespace-nowrap">
                          {formatDong(row.unitPriceDong)}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} ${NUM}`}>
                      {row.lastCostDong == null ? (
                        <span className="text-[var(--tlkv-muted)]">-</span>
                      ) : (
                        formatDong(row.lastCostDong)
                      )}
                    </td>
                    <td className={`${TD} ${NUM} font-medium`}>
                      {value === null ? <span className="text-[var(--tlkv-muted)]">-</span> : formatDong(value)}
                    </td>
                    <td className={`${TD} pr-0 text-center`}>
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
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${className}`}
    >
      {STOCK_STATUS_LABEL[status]}
    </span>
  );
}
