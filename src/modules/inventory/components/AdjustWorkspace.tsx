"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowsLeftRight, MagnifyingGlass } from "@phosphor-icons/react";
import { findSkuIdsByMspQuery } from "@/modules/label-print/msp-search";
import { formatViDateTime } from "@/shared/lib/datetime";
import { Modal } from "@/shared/ui/Modal";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { adjustStock } from "../actions";
import { ledgerTypeLabel, STOCK_STATUS_LABEL } from "../labels";
import {
  stockStatus,
  type ProductTypeOption,
  type StockFilter,
  type StockRow,
} from "../types";

const PAGE_SIZES = [10, 20, 50] as const;
const TH = "px-2 py-2.5 align-bottom font-medium leading-snug";
const TD = "px-2 py-3 align-middle";

type SortKey = "sku" | "name" | "quantity";

export function AdjustWorkspace({
  initialRows,
  productTypes = [],
  canMutate = true,
}: {
  initialRows: StockRow[];
  productTypes?: ProductTypeOption[];
  canMutate?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [mspSkuIds, setMspSkuIds] = useState<string[]>([]);
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      setMspSkuIds([]);
      return;
    }
    void findSkuIdsByMspQuery(q)
      .then((ids) => {
        if (!cancelled) setMspSkuIds(ids);
      })
      .catch(() => {
        if (!cancelled) setMspSkuIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const brands = useMemo(
    () =>
      (Array.from(new Set(rows.map((row) => row.brandName).filter(Boolean))) as string[]).sort(
        (a, b) => a.localeCompare(b, "vi"),
      ),
    [rows],
  );
  const hasNoBrand = useMemo(() => rows.some((row) => !row.brandName), [rows]);

  const brandScoped = useMemo(() => {
    return rows.filter((row) => {
      if (!brand) return true;
      if (brand === "__none__") return !row.brandName;
      return row.brandName === brand;
    });
  }, [brand, rows]);

  const categories = useMemo(
    () =>
      Array.from(new Set(brandScoped.map((row) => row.category).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "vi"),
      ),
    [brandScoped],
  );

  const productTypeOptions = useMemo(() => {
    const ids = new Set(
      brandScoped.map((row) => row.productTypeId).filter((id): id is string => Boolean(id)),
    );
    return {
      types: productTypes.filter((type) => ids.has(type.id)),
      hasNone: brandScoped.some((row) => !row.productTypeId),
    };
  }, [brandScoped, productTypes]);

  useEffect(() => {
    if (category && !categories.includes(category)) setCategory("");
  }, [category, categories]);

  useEffect(() => {
    if (!productTypeId) return;
    if (productTypeId === "__none__") {
      if (!productTypeOptions.hasNone) setProductTypeId("");
      return;
    }
    if (!productTypeOptions.types.some((type) => type.id === productTypeId)) {
      setProductTypeId("");
    }
  }, [productTypeId, productTypeOptions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = brandScoped.filter((row) => {
      const status = stockStatus(row.quantity);
      const matchesStock = stockFilter === "ALL" || status === stockFilter;
      const matchesCategory = !category || row.category === category;
      const matchesType =
        !productTypeId ||
        (productTypeId === "__none__" ? !row.productTypeId : row.productTypeId === productTypeId);
      const matchesQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        (row.brandName ?? "").toLowerCase().includes(q) ||
        mspSkuIds.includes(row.skuId);
      return matchesStock && matchesCategory && matchesType && matchesQuery;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "quantity") return (a.quantity - b.quantity) * dir;
      if (sortKey === "sku") return a.sku.localeCompare(b.sku, "vi") * dir;
      return a.name.localeCompare(b.name, "vi") * dir;
    });
  }, [
    brandScoped,
    query,
    stockFilter,
    category,
    productTypeId,
    mspSkuIds,
    sortKey,
    sortDir,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function resetFilters() {
    setQuery("");
    setBrand("");
    setCategory("");
    setProductTypeId("");
    setStockFilter("ALL");
    setSortKey("name");
    setSortDir("asc");
    setPage(0);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "quantity" ? "desc" : "asc");
    }
    setPage(0);
  }

  function onAdjusted(skuId: string, nextQty: number, delta: number, reason: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.skuId === skuId
          ? { ...row, quantity: nextQty, stockUpdatedAt: new Date().toISOString() }
          : row,
      ),
    );
    setSelected(null);
    const direction = delta > 0 ? "tăng" : "giảm";
    setAlert({
      tone: "success",
      title: "Điều chỉnh kho thành công",
      reason: `Đã ${direction} ${Math.abs(delta)} chiếc.`,
      detail: `Lý do: ${reason}. Loại biến động: ${ledgerTypeLabel(
        delta > 0 ? "STOCK_ADJUSTMENT_IN" : "STOCK_ADJUSTMENT_OUT",
      )}. Tồn sau điều chỉnh: ${nextQty}.`,
    });
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold">Điều chỉnh kho</h1>
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
            Tìm mã hàng trên danh sách, mở Điều chỉnh từng dòng. Số dương tăng tồn, số âm giảm tồn;
            bắt buộc có lý do. Không sửa tồn trực tiếp trên bảng.
          </p>
        </div>
        {!canMutate ? (
          <p className="rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[12px] text-[var(--tlkv-muted)]">
            Tài khoản chỉ xem — không được ghi điều chỉnh kho.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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
            placeholder="Tìm mã hàng, tên sản phẩm, MSP..."
            className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>
        <select
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value);
            setCategory("");
            setProductTypeId("");
            setPage(0);
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          aria-label="Thương hiệu"
        >
          <option value="">Tất cả thương hiệu</option>
          {brands.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {hasNoBrand ? <option value="__none__">Không brand</option> : null}
        </select>
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(0);
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          aria-label="Danh mục"
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
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          aria-label="Loại sản phẩm"
        >
          <option value="">Tất cả loại sản phẩm</option>
          {productTypeOptions.types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
          {productTypeOptions.hasNone ? <option value="__none__">Chưa phân loại</option> : null}
        </select>
        <select
          value={stockFilter}
          onChange={(event) => {
            setStockFilter(event.target.value as StockFilter);
            setPage(0);
          }}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          aria-label="Tình trạng tồn kho"
        >
          <option value="ALL">Tất cả tình trạng tồn</option>
          <option value="IN_STOCK">{STOCK_STATUS_LABEL.IN_STOCK}</option>
          <option value="LOW_STOCK">{STOCK_STATUS_LABEL.LOW_STOCK}</option>
          <option value="OUT_OF_STOCK">{STOCK_STATUS_LABEL.OUT_OF_STOCK}</option>
        </select>
        <button
          type="button"
          onClick={resetFilters}
          className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
        >
          Làm mới bộ lọc
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className={`${TH} pl-0`}>Sản phẩm</th>
              <th className={TH}>
                <SortButton active={sortKey === "sku"} dir={sortDir} onClick={() => toggleSort("sku")}>
                  Mã hàng
                </SortButton>
              </th>
              <th className={TH}>Thương hiệu</th>
              <th className={TH}>Danh mục</th>
              <th className={`${TH} text-right`}>Định lượng</th>
              <th className={`${TH} text-right`}>
                <SortButton
                  active={sortKey === "quantity"}
                  dir={sortDir}
                  onClick={() => toggleSort("quantity")}
                >
                  SL tồn
                </SortButton>
              </th>
              <th className={TH}>Cập nhật gần nhất</th>
              <th className={`${TH} pr-0 text-center`}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[var(--tlkv-muted)]">
                  Không có mã hàng khớp bộ lọc.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const status = stockStatus(row.quantity);
                return (
                  <tr key={row.skuId} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                    <td className={`${TD} pl-0`}>
                      <div className="flex items-center gap-3">
                        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--tlkv-bg)]">
                          {row.imageUrl ? (
                            <Image
                              src={row.imageUrl}
                              alt={row.name}
                              fill
                              unoptimized
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[12px] font-semibold text-[var(--tlkv-muted)]">
                              {row.name.slice(0, 1)}
                            </span>
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium leading-snug [overflow-wrap:anywhere]">{row.name}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--tlkv-muted)]">
                            {STOCK_STATUS_LABEL[status]}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} font-semibold text-[var(--tlkv-red)]`}>{row.sku}</td>
                    <td className={TD}>{row.brandName || "Không brand"}</td>
                    <td className={TD}>{row.category}</td>
                    <td className={`${TD} text-right tabular-nums text-[var(--tlkv-muted)]`}>
                      {row.weightChi.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ
                    </td>
                    <td className={`${TD} text-right tabular-nums font-semibold`}>{row.quantity}</td>
                    <td className={`${TD} text-[12px] text-[var(--tlkv-muted)]`}>
                      {row.stockUpdatedAt ? formatViDateTime(row.stockUpdatedAt) : "—"}
                    </td>
                    <td className={`${TD} pr-0 text-center`}>
                      <button
                        type="button"
                        disabled={!canMutate}
                        onClick={() => setSelected(row)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--tlkv-amber)] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                      >
                        <ArrowsLeftRight size={14} weight="bold" />
                        Điều chỉnh
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[var(--tlkv-muted)]">
        <p>
          Hiển thị {filtered.length === 0 ? 0 : safePage * pageSize + 1}–
          {Math.min((safePage + 1) * pageSize, filtered.length)} / {filtered.length} kết quả
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5">
            Số dòng
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
                setPage(0);
              }}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px]"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
          >
            Trước
          </button>
          <span>
            {safePage + 1}/{pageCount}
          </span>
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

      {selected ? (
        <AdjustModal
          row={selected}
          onClose={() => setSelected(null)}
          onSuccess={onAdjusted}
          onError={(message) =>
            setAlert({
              tone: "error",
              title: "Điều chỉnh kho thất bại",
              reason: message,
              detail: "Tồn kho không đổi. Không có bản ghi biến động.",
            })
          }
        />
      ) : null}

      {alert ? (
        <ResultAlert alert={alert} onClose={() => setAlert(null)}>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className={`h-10 rounded-lg px-4 text-[13px] font-semibold text-white ${
              alert.tone === "success" ? "bg-[var(--tlkv-green)]" : "bg-[var(--tlkv-red)]"
            }`}
          >
            Đã hiểu
          </button>
        </ResultAlert>
      ) : null}
    </section>
  );
}

function SortButton({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 ${active ? "text-[var(--tlkv-text)]" : ""}`}
    >
      {children}
      {active ? <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );
}

function AdjustModal({
  row,
  onClose,
  onSuccess,
  onError,
}: {
  row: StockRow;
  onClose: () => void;
  onSuccess: (skuId: string, nextQty: number, delta: number, reason: string) => void;
  onError: (message: string) => void;
}) {
  const [quantityText, setQuantityText] = useState("-1");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const delta = Number(quantityText);
  const reasonOk = reason.trim().length > 0;
  const qtyOk = Number.isInteger(delta) && delta !== 0;
  const projected = row.quantity + (Number.isFinite(delta) ? delta : 0);
  const wouldGoNegative = qtyOk && projected < 0;
  const canSubmit = qtyOk && reasonOk && !wouldGoNegative && !pending;

  async function confirm() {
    if (!canSubmit || pending) return;
    setLocalError(null);
    setPending(true);
    try {
      const formData = new FormData();
      formData.set("sku_id", row.skuId);
      formData.set("quantity", String(delta));
      formData.set("reason", reason.trim());
      await adjustStock(formData);
      onSuccess(row.skuId, projected, delta, reason.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không ghi được điều chỉnh.";
      setLocalError(message);
      onError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      title="Điều chỉnh tồn kho"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-semibold"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void confirm()}
            className="h-10 rounded-lg bg-[var(--tlkv-amber)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Đang ghi..." : "Xác nhận điều chỉnh"}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-[13px]">
        <div className="rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-3 py-3">
          <p className="font-semibold text-[var(--tlkv-text)]">{row.name}</p>
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
            Mã hàng <span className="font-semibold text-[var(--tlkv-red)]">{row.sku}</span>
            {" · "}
            {row.brandName || "Không brand"}
          </p>
          <p className="mt-2 text-[12px]">
            Tồn hiện tại: <strong className="tabular-nums">{row.quantity}</strong> chiếc
          </p>
        </div>

        <label className="block">
          Số lượng điều chỉnh (+/-)
          <input
            type="number"
            step={1}
            value={quantityText}
            onChange={(event) => setQuantityText(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 outline-none focus:border-[var(--tlkv-red)]"
          />
          <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
            Dương = tăng tồn. Âm = giảm tồn. Không được bằng 0.
          </span>
        </label>

        <label className="block">
          Lý do điều chỉnh *
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Kiểm kê / hàng lỗi / ..."
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 outline-none focus:border-[var(--tlkv-red)]"
          />
        </label>

        <div className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2">
          <p className="text-[12px] text-[var(--tlkv-muted)]">Tồn sau điều chỉnh dự kiến</p>
          <p
            className={`mt-0.5 text-[18px] font-bold tabular-nums ${
              wouldGoNegative ? "text-[var(--tlkv-red)]" : "text-[var(--tlkv-text)]"
            }`}
          >
            {Number.isFinite(projected) ? projected : "—"}
          </p>
          {wouldGoNegative ? (
            <p className="mt-1 text-[12px] text-[var(--tlkv-red)]">
              Không được giảm vượt quá số lượng khả dụng hiện tại.
            </p>
          ) : null}
        </div>

        {localError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {localError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
