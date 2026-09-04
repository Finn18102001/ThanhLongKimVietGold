"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import type { PurchaseCatalogItem } from "../types";
import { PurchaseCatalogCard } from "./PurchaseCatalogCard";

const PAGE_SIZE = 12;

export function PurchaseCatalogPanel({
  catalog,
  onPickCatalog,
  onOpenMarket,
}: {
  catalog: PurchaseCatalogItem[];
  onPickCatalog: (item: PurchaseCatalogItem) => void;
  onOpenMarket: () => void;
}) {
  const [group, setGroup] = useState("Tất cả");
  const [brandName, setBrandName] = useState("all");
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);

  const groups = useMemo(() => {
    const unique = Array.from(new Set(catalog.map((item) => item.browseGroup)));
    return ["Tất cả", ...unique];
  }, [catalog]);

  const brandOptions = useMemo(() => {
    const names = Array.from(
      new Set(catalog.map((item) => item.brandName?.trim()).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b, "vi"));
    return names;
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesBrand =
        brandName === "all" ||
        (brandName === "none"
          ? !item.brandName
          : (item.brandName || "").trim() === brandName);
      const matchesGroup = group === "Tất cả" || item.browseGroup === group;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.brandName || "").toLowerCase().includes(q);
      return matchesBrand && matchesGroup && matchesQuery;
    });
  }, [brandName, catalog, group, query]);

  useEffect(() => {
    setPageIndex(0);
  }, [brandName, group, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="flex min-h-0 flex-col rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Sản phẩm đang bán</h2>
        <button
          type="button"
          onClick={onOpenMarket}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white"
        >
          <Plus size={14} weight="bold" />
          Vàng thị trường
        </button>
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
        {pageItems.length === 0 ? (
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
