"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Eye,
  EyeSlash,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import {
  createProductAdmin,
  deleteProductAdmin,
  listProductAdminPageAction,
  setOrphanSkuAdminActive,
  setProductAdminActive,
  updateProductAdmin,
} from "./actions";
import { ProductFormModal } from "./ProductFormModal";
import type {
  ProductAdminListPayload,
  ProductAdminRow,
  ProductAdminSummary,
} from "./types";
import { PRODUCT_DEFAULT_PAGE_SIZE, PRODUCT_PAGE_SIZE_OPTIONS } from "./types";

const TH = "px-3 py-2.5 font-medium text-[12px] text-[var(--tlkv-muted)]";
const TD = "px-3 py-3 align-top text-[13px]";

function SourceBadge({ row }: { row: ProductAdminRow }) {
  const tone =
    row.kind === "ORPHAN_SKU"
      ? "bg-amber-50 text-amber-700"
      : row.source === "ORDER"
        ? "bg-blue-50 text-blue-700"
        : "bg-emerald-50 text-emerald-700";
  const label =
    row.kind === "ORPHAN_SKU"
      ? "Mã hàng chưa gắn sản phẩm"
      : row.source === "ORDER"
        ? "Đặt hàng / nhập kho"
        : "Sản phẩm danh mục";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean | null;
  activeLabel: string;
  inactiveLabel: string;
}) {
  if (active == null) {
    return <span className="rounded-full bg-[var(--tlkv-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tlkv-muted)]">-</span>;
  }
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-[var(--tlkv-bg)] text-[var(--tlkv-muted)]"
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function ProductWorkspace({
  initial,
  canMutate,
}: {
  initial: ProductAdminListPayload;
  canMutate: boolean;
}) {
  const [rows, setRows] = useState(initial.rows);
  const [summary, setSummary] = useState<ProductAdminSummary>(initial.summary);
  const [totalCount, setTotalCount] = useState(initial.totalCount);
  const [pageSize, setPageSize] = useState(initial.limit || PRODUCT_DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [source, setSource] = useState<"" | "CATALOG" | "ORDER" | "ORPHAN_SKU">("");
  const [productState, setProductState] = useState<"" | "active" | "hidden">("");
  const [posState, setPosState] = useState<"" | "visible" | "hidden" | "none">("");
  const [modal, setModal] = useState<{ mode: "create" | "edit" | "view"; row?: ProductAdminRow | null } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const skipFirstFetch = useRef(true);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = query.trim();
      if (next === debouncedQuery) return;
      setDebouncedQuery(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, debouncedQuery]);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const result = await listProductAdminPageAction({
        q: debouncedQuery,
        brandId: brandId || undefined,
        categoryId: categoryId || undefined,
        productTypeId: productTypeId || undefined,
        source: source || undefined,
        productState: productState || undefined,
        posState: posState || undefined,
        limit: pageSize,
        offset: (safePage - 1) * pageSize,
      });
      if (cancelled) return;
      if (!result.ok) {
        setAlert({
          tone: "error",
          title: "Không tải được danh sách",
          reason: result.message,
        });
        return;
      }
      setRows(result.data.rows);
      setTotalCount(result.data.totalCount);
      setSummary(result.data.summary);
    });
    return () => {
      cancelled = true;
    };
  }, [
    debouncedQuery,
    brandId,
    categoryId,
    productTypeId,
    source,
    productState,
    posState,
    pageSize,
    safePage,
  ]);

  async function reloadCurrentPage(nextPage = safePage) {
    const result = await listProductAdminPageAction({
      q: debouncedQuery,
      brandId: brandId || undefined,
      categoryId: categoryId || undefined,
      productTypeId: productTypeId || undefined,
      source: source || undefined,
      productState: productState || undefined,
      posState: posState || undefined,
      limit: pageSize,
      offset: (nextPage - 1) * pageSize,
    });
    if (!result.ok) {
      setAlert({
        tone: "error",
        title: "Không tải được danh sách",
        reason: result.message,
      });
      return;
    }
    setRows(result.data.rows);
    setTotalCount(result.data.totalCount);
    setSummary(result.data.summary);
  }

  function changeFilter<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  async function onCreate(input: Parameters<typeof createProductAdmin>[0]) {
    const result = await createProductAdmin(input);
    if (!result.ok) throw new Error(result.message);
    setModal(null);
    setPage(1);
    setAlert({
      tone: "success",
      title: "Tạo sản phẩm thành công",
      reason: `Đã tạo ${result.data.row.name}. Mã hàng kho sẽ được hệ thống đồng bộ tự động.`,
    });
    await reloadCurrentPage(1);
  }

  async function onUpdate(input: Parameters<typeof updateProductAdmin>[1]) {
    if (!modal?.row?.productId) throw new Error("Thiếu sản phẩm cần sửa.");
    const result = await updateProductAdmin(modal.row.productId, input);
    if (!result.ok) throw new Error(result.message);
    setModal(null);
    setAlert({
      tone: "success",
      title: "Cập nhật thành công",
      reason:
        result.data.changedFields.length === 0
          ? "Không có nội dung nào thay đổi."
          : `Đã lưu ${result.data.changedFields.length} thay đổi cho ${result.data.row.name}.`,
    });
    await reloadCurrentPage();
  }

  function openDelete(row: ProductAdminRow) {
    if (!row.productId) return;
    const confirmed = confirm(
      "Xóa sản phẩm này? Nếu đã có mã hàng kho gắn với sản phẩm, mã hàng vẫn còn và chuyển sang trạng thái chưa gắn sản phẩm.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteProductAdmin(row.productId!);
      if (!result.ok) {
        setAlert({
          tone: "error",
          title: "Xóa sản phẩm thất bại",
          reason: result.message,
        });
        return;
      }
      setAlert({
        tone: "success",
        title: "Đã xóa sản phẩm",
        reason: result.data.orphanRow
          ? "Sản phẩm đã xóa. Mã hàng liên kết vẫn còn trong kho và nay hiện dưới dạng mã hàng chưa gắn sản phẩm."
          : "Sản phẩm đã được xóa.",
      });
      await reloadCurrentPage();
    });
  }

  function toggleRow(row: ProductAdminRow) {
    const target = row.kind === "ORPHAN_SKU" ? !(row.skuActive === true) : !(row.productActive === true);
    startTransition(async () => {
      const result =
        row.kind === "ORPHAN_SKU"
          ? await setOrphanSkuAdminActive(row.skuId!, target)
          : await setProductAdminActive(row.productId!, target);
      if (!result.ok) {
        setAlert({
          tone: "error",
          title: "Đổi trạng thái thất bại",
          reason: result.message,
        });
        return;
      }
      setAlert({
        tone: "success",
        title: "Đã cập nhật trạng thái",
        reason:
          row.kind === "ORPHAN_SKU"
            ? target
              ? "Mã hàng chưa gắn sản phẩm đã hiện lại trên POS."
              : "Mã hàng chưa gắn sản phẩm đã được ẩn khỏi POS."
            : target
              ? "Sản phẩm đã bật lại."
              : "Sản phẩm đã được ẩn.",
      });
      await reloadCurrentPage();
    });
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold">Sản phẩm</h1>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Quản lý sản phẩm danh mục và mã hàng chưa gắn sản phẩm đang còn trong hệ thống bán hàng.
            </p>
          </div>
          {canMutate ? (
            <button
              type="button"
              onClick={() => setModal({ mode: "create" })}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
            >
              <Plus size={14} weight="bold" />
              Tạo sản phẩm
            </button>
          ) : (
            <p className="rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[12px] text-[var(--tlkv-muted)]">
              Tài khoản chỉ xem: không tạo, sửa, xóa hay đổi trạng thái.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <p className="text-[12px] text-[var(--tlkv-muted)]">Tổng bản ghi</p>
            <p className="mt-1 text-[24px] font-semibold">{summary.total}</p>
          </div>
          <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <p className="text-[12px] text-[var(--tlkv-muted)]">Sản phẩm đang ẩn</p>
            <p className="mt-1 text-[24px] font-semibold">{summary.hiddenProduct}</p>
          </div>
          <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <p className="text-[12px] text-[var(--tlkv-muted)]">Mã hàng đang ẩn trên POS</p>
            <p className="mt-1 text-[24px] font-semibold">{summary.hiddenPos}</p>
          </div>
          <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <p className="text-[12px] text-[var(--tlkv-muted)]">Mã hàng chưa gắn sản phẩm</p>
            <p className="mt-1 text-[24px] font-semibold">{summary.orphan}</p>
          </div>
        </div>

        <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm tên, mã hàng, đường dẫn..."
              className="h-10 min-w-[220px] flex-1 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <select
              value={brandId}
              onChange={(event) => changeFilter(setBrandId, event.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả thương hiệu</option>
              {initial.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <select
              value={categoryId}
              onChange={(event) => changeFilter(setCategoryId, event.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả danh mục</option>
              {initial.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={productTypeId}
              onChange={(event) => changeFilter(setProductTypeId, event.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả loại</option>
              {initial.productTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            <select
              value={source}
              onChange={(event) => changeFilter(setSource, event.target.value as typeof source)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Mọi nguồn</option>
              <option value="CATALOG">Sản phẩm danh mục</option>
              <option value="ORDER">Đặt hàng / nhập kho</option>
              <option value="ORPHAN_SKU">Mã hàng chưa gắn sản phẩm</option>
            </select>
            <select
              value={productState}
              onChange={(event) => changeFilter(setProductState, event.target.value as typeof productState)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Mọi trạng thái sản phẩm</option>
              <option value="active">Sản phẩm hoạt động</option>
              <option value="hidden">Sản phẩm ẩn</option>
            </select>
            <select
              value={posState}
              onChange={(event) => changeFilter(setPosState, event.target.value as typeof posState)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Mọi trạng thái POS</option>
              <option value="visible">Hiện trên POS</option>
              <option value="hidden">Ẩn trên POS</option>
              <option value="none">Không có mã hàng</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1260px] w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className={TH}>Sản phẩm</th>
                  <th className={TH}>Mã hàng</th>
                  <th className={TH}>Nguồn</th>
                  <th className={TH}>Thương hiệu</th>
                  <th className={TH}>Danh mục</th>
                  <th className={TH}>Loại</th>
                  <th className={TH}>Sản phẩm</th>
                  <th className={TH}>POS</th>
                  <th className={`${TH} text-right`}>Tồn</th>
                  <th className={`${TH} text-right`}>Giá vốn gần nhất</th>
                  <th className={TH}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[13px] text-[var(--tlkv-muted)]">
                      {pending ? "Đang tải..." : "Không có sản phẩm khớp bộ lọc."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.rowId} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                      <td className={TD}>
                        <div className="font-medium">{row.name}</div>
                        <div className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
                          {row.slug || row.productId || row.skuId}
                        </div>
                      </td>
                      <td className={`${TD} font-semibold text-[var(--tlkv-red)]`}>{row.sku ?? "-"}</td>
                      <td className={TD}>
                        <SourceBadge row={row} />
                      </td>
                      <td className={TD}>{row.brandName || "Không thương hiệu"}</td>
                      <td className={TD}>{row.categoryName || "-"}</td>
                      <td className={TD}>{row.productTypeName || "-"}</td>
                      <td className={TD}>
                        <StatusBadge active={row.productActive} activeLabel="Hoạt động" inactiveLabel="Ẩn" />
                      </td>
                      <td className={TD}>
                        <StatusBadge active={row.skuActive} activeLabel="Hiện" inactiveLabel="Ẩn" />
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{row.quantity}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {row.lastCostDong == null ? "-" : formatDong(row.lastCostDong)}
                      </td>
                      <td className={TD}>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setModal({ mode: "view", row })}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                          >
                            <Eye size={14} />
                            Xem
                          </button>
                          {canMutate && row.kind === "PRODUCT" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setModal({ mode: "edit", row })}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                              >
                                <PencilSimple size={14} />
                                Sửa
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => toggleRow(row)}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                              >
                                {row.productActive === false ? <Eye size={14} /> : <EyeSlash size={14} />}
                                {row.productActive === false ? "Hiện lại" : "Ẩn"}
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => openDelete(row)}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] text-[var(--tlkv-red)]"
                              >
                                <Trash size={14} />
                                Xóa sản phẩm
                              </button>
                            </>
                          ) : null}
                          {canMutate && row.kind === "ORPHAN_SKU" ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => toggleRow(row)}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px]"
                            >
                              {row.skuActive === false ? <Eye size={14} /> : <EyeSlash size={14} />}
                              {row.skuActive === false ? "Hiện POS" : "Ẩn POS"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[var(--tlkv-muted)]">
            <p>
              Trang {safePage}/{pageCount} · {totalCount} sản phẩm (mới nhất lên đầu)
              {pending ? " · Đang tải..." : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5">
                <span>Số dòng/trang</span>
                <select
                  value={pageSize}
                  disabled={pending}
                  onChange={(event) => changeFilter(setPageSize, Number(event.target.value))}
                  className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px]"
                >
                  {PRODUCT_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={pending || safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
              >
                Trước
              </button>
              <button
                type="button"
                disabled={pending || safePage >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <WarningCircle size={16} className="mt-0.5 shrink-0" weight="fill" />
            <p>
              Xóa sản phẩm chỉ xóa bản ghi sản phẩm danh mục. Nếu mã hàng kho đang gắn với sản phẩm đó, mã
              hàng vẫn còn và chuyển sang trạng thái chưa gắn sản phẩm.
            </p>
          </div>
        </section>
      </div>

      {modal ? (
        <ProductFormModal
          title={
            modal.mode === "create"
              ? "Tạo sản phẩm"
              : modal.mode === "edit"
                ? "Sửa sản phẩm"
                : modal.row?.kind === "ORPHAN_SKU"
                  ? "Chi tiết mã hàng chưa gắn sản phẩm"
                  : "Chi tiết sản phẩm"
          }
          mode={modal.mode}
          initial={modal.row ?? null}
          brands={initial.brands}
          categories={initial.categories}
          brandCategories={initial.brandCategories}
          productTypes={initial.productTypes}
          priceRows={initial.priceRows}
          pending={pending}
          onClose={() => setModal(null)}
          onSave={
            modal.mode === "create"
              ? async (input) =>
                  await new Promise<void>((resolve, reject) => {
                    startTransition(async () => {
                      try {
                        await onCreate(input);
                        resolve();
                      } catch (err) {
                        reject(err);
                      }
                    });
                  })
              : modal.mode === "edit"
                ? async (input) =>
                    await new Promise<void>((resolve, reject) => {
                      startTransition(async () => {
                        try {
                          await onUpdate(input);
                          resolve();
                        } catch (err) {
                          reject(err);
                        }
                      });
                    })
                : undefined
          }
        />
      ) : null}

      {alert ? (
        <ResultAlert alert={alert} onClose={() => setAlert(null)}>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
          >
            Đóng
          </button>
        </ResultAlert>
      ) : null}
    </>
  );
}
