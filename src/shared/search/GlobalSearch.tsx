"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cube, MagnifyingGlass, Receipt, UsersThree } from "@phosphor-icons/react";
import { globalSearch } from "./actions";
import type { GlobalSearchItem, GlobalSearchResponse } from "./types";

const EMPTY: GlobalSearchResponse = {
  query: "",
  products: [],
  customers: [],
  invoices: [],
};

const KIND_LABEL = {
  product: "Sản phẩm",
  customer: "Khách hàng",
  invoice: "Hóa đơn",
} as const;

export function GlobalSearch() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GlobalSearchResponse>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(EMPTY);
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(async () => {
        try {
          setResults(await globalSearch(trimmed));
          setError(null);
          setOpen(true);
        } catch (err) {
          setResults(EMPTY);
          setError(err instanceof Error ? err.message : "Không tìm được kết quả.");
          setOpen(true);
        }
      });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const flat = [...results.products, ...results.customers, ...results.invoices];
  const hasQuery = query.trim().length >= 2;
  const showPanel = open && hasQuery;

  function goToFirstResult() {
    const first = flat[0];
    if (!first) return;
    setOpen(false);
    router.push(first.href);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (flat.length === 1) {
      setOpen(false);
      router.push(flat[0].href);
      return;
    }
    if (flat.length > 0) {
      goToFirstResult();
      return;
    }
    const q = query.trim();
    if (q.length >= 2) {
      setOpen(false);
      router.push(`/customers?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-[220px] flex-1">
      <form onSubmit={onSubmit}>
        <label className="relative block">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--tlkv-faint)]"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              if (hasQuery) setOpen(true);
            }}
            placeholder="Tìm kiếm sản phẩm, hóa đơn, khách hàng..."
            className="h-10 w-full rounded-full border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] pr-4 pl-10 text-sm text-[var(--tlkv-text)] outline-none placeholder:text-[var(--tlkv-faint)] focus:border-[var(--tlkv-red)] focus:bg-white"
            autoComplete="off"
            aria-expanded={showPanel}
            aria-controls="global-search-panel"
          />
        </label>
      </form>

      {showPanel ? (
        <div
          id="global-search-panel"
          className="absolute top-[calc(100%+0.5rem)] left-0 z-50 w-full min-w-[320px] overflow-hidden rounded-[12px] border border-[var(--tlkv-line)] bg-white shadow-[0_12px_40px_rgb(31_41_55/0.12)]"
        >
          {pending ? (
            <p className="px-4 py-3 text-[13px] text-[var(--tlkv-muted)]">Đang tìm...</p>
          ) : error ? (
            <p className="px-4 py-3 text-[13px] text-[var(--tlkv-red)]">{error}</p>
          ) : flat.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-[var(--tlkv-muted)]">
              Không có kết quả cho &quot;{results.query}&quot;.
            </p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto py-1">
              {(["product", "customer", "invoice"] as const).map((kind) => {
                const items = results[`${kind}s` as "products" | "customers" | "invoices"] as GlobalSearchItem[];
                if (items.length === 0) return null;
                return (
                  <section key={kind}>
                    <p className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-[0.08em] text-[var(--tlkv-faint)] uppercase">
                      {KIND_LABEL[kind]}
                    </p>
                    <ul>
                      {items.map((item) => (
                        <li key={`${item.kind}-${"id" in item ? item.id : item.invoiceNo}`}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--tlkv-bg)]"
                          >
                            <span className="mt-0.5 text-[var(--tlkv-muted)]">
                              {item.kind === "product" ? (
                                <Cube size={16} />
                              ) : item.kind === "customer" ? (
                                <UsersThree size={16} />
                              ) : (
                                <Receipt size={16} />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-[var(--tlkv-text)]">
                                {item.kind === "invoice" ? item.invoiceNo : item.name}
                              </span>
                              <span className="block truncate text-[12px] text-[var(--tlkv-muted)]">
                                {item.kind === "product"
                                  ? item.sku
                                  : item.kind === "customer"
                                    ? item.subtitle
                                    : item.subtitle}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
