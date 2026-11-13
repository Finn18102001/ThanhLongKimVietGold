"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  isGoldCatalogItem,
  prioritizeGoldFirst,
  prioritizeGoldGroupLabels,
} from "@/shared/lib/catalog-priority";
import { formatDong } from "@/shared/lib/money";
import {
  MARKET_GOLD_CLASSES,
  MARKET_GOLD_CLASS_LABEL,
  MARKET_GOLD_GROUP,
  type MarketGoldClass,
  type MarketGoldClassPrices,
  type PosProductTypeOption,
} from "@/modules/pos/types";
import type { PurchaseCatalogItem } from "../types";
import { PurchaseCatalogCard } from "./PurchaseCatalogCard";

const PAGE_SIZE = 12;

export function PurchaseCatalogPanel({
  catalog,
  productTypes = [],
  marketPrices = {},
  onPickCatalog,
  onOpenMarket,
}: {
  catalog: PurchaseCatalogItem[];
  productTypes?: PosProductTypeOption[];
  marketPrices?: MarketGoldClassPrices;
  onPickCatalog: (item: PurchaseCatalogItem) => void;
  onOpenMarket: (marketClass: MarketGoldClass) => void;
}) {
  const [group, setGroup] = useState("Tất cả");
  const [brandName, setBrandName] = useState("all");
  const [productTypeId, setProductTypeId] = useState("all");
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);

  const groups = useMemo(() => {
    const unique = Array.from(new Set([MARKET_GOLD_GROUP, ...catalog.map((item) => item.browseGroup)]));
    return prioritizeGoldGroupLabels(["Tất cả", ...unique]);
  }, [catalog]);
  const showMarketCards =
    (group === "Tất cả" || group === MARKET_GOLD_GROUP) &&
    (brandName === "all" || brandName === MARKET_GOLD_GROUP) &&
    productTypeId === "all" &&
    (!query.trim() || MARKET_GOLD_GROUP.toLowerCase().includes(query.trim().toLowerCase()) ||
      "bạc thị trường".includes(query.trim().toLowerCase()));

  const brandOptions = useMemo(() => {
    const names = Array.from(
      new Set(catalog.map((item) => item.brandName?.trim()).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b, "vi"));
    return names;
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = catalog.filter((item) => {
      const matchesBrand =
        brandName === "all" ||
        (brandName === "none"
          ? !item.brandName
          : (item.brandName || "").trim() === brandName);
      const matchesType =
        productTypeId === "all" ||
        (productTypeId === "none" ? !item.productTypeId : item.productTypeId === productTypeId);
      const matchesGroup = group === "Tất cả" || item.browseGroup === group;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.brandName || "").toLowerCase().includes(q);
      return matchesBrand && matchesType && matchesGroup && matchesQuery;
    });
    return prioritizeGoldFirst(rows, isGoldCatalogItem);
  }, [brandName, catalog, group, productTypeId, query]);

  useEffect(() => {
    setPageIndex(0);
  }, [brandName, group, productTypeId, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="flex min-h-0 flex-col rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Sản phẩm đang bán</h2>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="relative min-w-[220px] flex-1">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm: nhập tên sản phẩm hoặc mã hàng..."
            className="h-10 w-full rounded-full border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>
        <label className="flex h-10 items-center gap-2 rounded-full border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 text-[13px]">
          <span className="whitespace-nowrap text-[var(--tlkv-muted)]">Thương hiệu</span>
          <select
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="max-w-[200px] bg-transparent text-[13px] font-medium outline-none"
          >
            <option value="all">Tất cả thương hiệu</option>
            {brandOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="none">Không thương hiệu</option>
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 rounded-full border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 text-[13px]">
          <span className="whitespace-nowrap text-[var(--tlkv-muted)]">Loại sản phẩm</span>
          <select
            value={productTypeId}
            onChange={(e) => setProductTypeId(e.target.value)}
            className="max-w-[160px] bg-transparent text-[13px] font-medium outline-none"
          >
            <option value="all">Tất cả loại</option>
            {productTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
            <option value="none">Chưa phân loại</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {groups.map((item) => {
          const active = item === group;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setGroup(item)}
              className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-medium ${
                active
                  ? "bg-[var(--tlkv-red)] text-white"
                  : "bg-[var(--tlkv-bg)] text-[var(--tlkv-text)] hover:bg-[var(--tlkv-red-soft)]"
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3 xl:grid-cols-4">
        {showMarketCards && safePage === 0
          ? MARKET_GOLD_CLASSES.map((cls) => {
              const buy = marketPrices[cls]?.buyDong ?? 0;
              return (
                <button
                  key={`market-${cls}`}
                  type="button"
                  onClick={() => onOpenMarket(cls)}
                  className="rounded-[12px] border border-[var(--tlkv-line)] bg-white p-3 text-left shadow-[var(--tlkv-shadow)] transition-transform hover:-translate-y-0.5 hover:border-[var(--tlkv-red)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-[11px] font-semibold tracking-wide text-[var(--tlkv-muted)]">
                      {MARKET_GOLD_GROUP}
                    </p>
                    <span className="rounded-md bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tlkv-amber)]">
                      Thị trường
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 min-h-[40px] text-[13.5px] font-semibold">
                    {MARKET_GOLD_CLASS_LABEL[cls]}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">Nhập tuổi vàng, KL thật</p>
                  <p className="mt-2 text-[14px] font-bold text-[var(--tlkv-red)]">
                    {buy > 0 ? `${formatDong(buy)}/chỉ` : "Chưa có giá"}
                  </p>
                </button>
              );
            })
          : null}
        {pageItems.length === 0 && !showMarketCards ? (
          <p className="col-span-full py-10 text-center text-[13px] text-[var(--tlkv-muted)]">
            Không có sản phẩm phù hợp.
          </p>
        ) : (
          pageItems.map((item) => (
            <PurchaseCatalogCard key={item.skuId} item={item} onPick={onPickCatalog} />
          ))
        )}
      </div>

      {pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-[12px] text-[var(--tlkv-muted)]">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      ) : null}
    </section>
  );
}
