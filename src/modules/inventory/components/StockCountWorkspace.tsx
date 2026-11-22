"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, FileXls, MagnifyingGlass, Plus, XCircle } from "@phosphor-icons/react";
import { formatViDate, formatViDateTime, formatVnIsoDate } from "@/shared/lib/datetime";
import { downloadCsv } from "@/shared/lib/csv";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import {
  approveStockCount,
  createStockCount,
  getStockCount,
  listStockCounts,
  rejectStockCount,
  submitStockCount,
  updateStockCountItem,
} from "../count-actions";
import {
  COUNT_STATUS_LABEL,
  LINE_STATUS_LABEL,
  formatSystemTotalChi,
  formatWeightChi,
  systemTotalChi,
  type StockCountLineStatus,
  type StockCountListRow,
  type StockCountSession,
  type StockCountStatus,
} from "../count-types";
import type { CategoryOption, ProductTypeOption } from "../types";

const LIST_PAGE_SIZES = [10, 20, 50] as const;

export function StockCountWorkspace({
  initialList,
  categories,
  productTypes = [],
  canMutate = true,
}: {
  initialList: { items: StockCountListRow[]; total: number };
  categories: CategoryOption[];
  productTypes?: ProductTypeOption[];
  canMutate?: boolean;
}) {
  const [list, setList] = useState(initialList);
  const [session, setSession] = useState<StockCountSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [scopeType, setScopeType] = useState<"ALL" | "CATEGORY">("ALL");
  const [scopeValue, setScopeValue] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [pending, startTransition] = useTransition();

  const [listQuery, setListQuery] = useState("");
  const [listStatus, setListStatus] = useState<"" | StockCountStatus>("");
  const [listScope, setListScope] = useState<"ALL" | "CATEGORY" | "">("");
  const [listFrom, setListFrom] = useState("");
  const [listTo, setListTo] = useState("");
  const [listPage, setListPage] = useState(0);
  const [listPageSize, setListPageSize] = useState<(typeof LIST_PAGE_SIZES)[number]>(10);
  const [listSort, setListSort] = useState<"created_desc" | "created_asc" | "status">("created_desc");

  const [itemQuery, setItemQuery] = useState("");
  const [itemBrand, setItemBrand] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemProductTypeId, setItemProductTypeId] = useState("");
  const [itemLineStatus, setItemLineStatus] = useState<"" | StockCountLineStatus>("");
  const [itemScopeView, setItemScopeView] = useState<"ALL" | "INCOMPLETE">("ALL");

  const canEdit =
    canMutate && (session?.status === "COUNTING" || session?.status === "DRAFT");
  const canSubmit = canEdit && (session?.summary.pendingCount ?? 0) === 0;
  const canApprove = canMutate && session?.status === "PENDING_APPROVAL";

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const brandOptions = useMemo(() => {
    if (!session) return [] as string[];
    return Array.from(
      new Set(
        session.items
          .map((line) => line.brandName)
          .filter((name): name is string => Boolean(name && name.trim())),
      ),
    ).sort((a, b) => a.localeCompare(b, "vi"));
  }, [session]);

  const itemCategories = useMemo(() => {
    if (!session) return [] as string[];
    return Array.from(
      new Set(
        session.items
          .map((line) => line.category)
          .filter((name): name is string => Boolean(name && name.trim())),
      ),
    ).sort((a, b) => a.localeCompare(b, "vi"));
  }, [session]);

  const itemProductTypeOptions = useMemo(() => {
    if (!session) return { types: [] as ProductTypeOption[], hasNone: false };
    const ids = new Set(
      session.items.map((line) => line.productTypeId).filter((id): id is string => Boolean(id)),
    );
    return {
      types: productTypes.filter((type) => ids.has(type.id)),
      hasNone: session.items.some((line) => !line.productTypeId),
    };
  }, [session, productTypes]);

  const filteredList = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    let rows = list.items.filter((row) => {
      if (q && !row.countNo.toLowerCase().includes(q)) return false;
      if (listStatus && row.status !== listStatus) return false;
      if (listScope === "ALL" && row.scopeType !== "ALL") return false;
      if (listScope === "CATEGORY" && row.scopeType !== "CATEGORY") return false;
      if (listFrom) {
        const day = formatVnIsoDate(row.createdAt);
        if (day < listFrom) return false;
      }
      if (listTo) {
        const day = formatVnIsoDate(row.createdAt);
        if (day > listTo) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (listSort === "status") {
        return COUNT_STATUS_LABEL[a.status].localeCompare(COUNT_STATUS_LABEL[b.status], "vi");
      }
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return listSort === "created_asc" ? ta - tb : tb - ta;
    });
    return rows;
  }, [list.items, listQuery, listStatus, listScope, listFrom, listTo, listSort]);

  const listPageCount = Math.max(1, Math.ceil(filteredList.length / listPageSize));
  const safeListPage = Math.min(listPage, listPageCount - 1);
  const pagedList = filteredList.slice(
    safeListPage * listPageSize,
    safeListPage * listPageSize + listPageSize,
  );

  const filteredItems = useMemo(() => {
    if (!session) return [];
    const q = itemQuery.trim().toLowerCase();
    return session.items.filter((line) => {
      if (itemScopeView === "INCOMPLETE" && line.lineStatus !== "PENDING") return false;
      if (itemLineStatus && line.lineStatus !== itemLineStatus) return false;
      const brandOk =
        !itemBrand ||
        (itemBrand === "__none__" ? !line.brandName : line.brandName === itemBrand);
      if (!brandOk) return false;
      if (itemCategory && (line.category ?? "") !== itemCategory) return false;
      const typeOk =
        !itemProductTypeId ||
        (itemProductTypeId === "__none__"
          ? !line.productTypeId
          : line.productTypeId === itemProductTypeId);
      if (!typeOk) return false;
      if (!q) return true;
      return (
        line.name.toLowerCase().includes(q) ||
        line.sku.toLowerCase().includes(q) ||
        (line.brandName ?? "").toLowerCase().includes(q)
      );
    });
  }, [
    session,
    itemQuery,
    itemBrand,
    itemCategory,
    itemProductTypeId,
    itemLineStatus,
    itemScopeView,
  ]);

  const filteredSummary = useMemo(() => {
    const base = {
      totalLines: filteredItems.length,
      matchCount: 0,
      excessCount: 0,
      lackCount: 0,
      pendingCount: 0,
    };
    for (const line of filteredItems) {
      if (line.lineStatus === "MATCH") base.matchCount += 1;
      else if (line.lineStatus === "EXCESS") base.excessCount += 1;
      else if (line.lineStatus === "LACK") base.lackCount += 1;
      else base.pendingCount += 1;
    }
    return base;
  }, [filteredItems]);

  function formatScope(scopeTypeValue: string, scopeValueValue: string | null) {
    if (scopeTypeValue === "ALL") return "Toàn kho";
    return categoryNameById[scopeValueValue ?? ""] ?? scopeValueValue ?? "Danh mục";
  }

  async function refreshList() {
    setList(await listStockCounts(100, 0));
  }

  function resetListFilters() {
    setListQuery("");
    setListStatus("");
    setListScope("");
    setListFrom("");
    setListTo("");
    setListSort("created_desc");
    setListPage(0);
  }

  function resetItemFilters() {
    setItemQuery("");
    setItemBrand("");
    setItemCategory("");
    setItemProductTypeId("");
    setItemLineStatus("");
    setItemScopeView("ALL");
  }

  function openSession(id: string) {
    startTransition(async () => {
      try {
        resetItemFilters();
        setSession(await getStockCount(id));
      } catch (err) {
        setAlert({
          tone: "error",
          title: "Không tải được phiên kiểm kê",
          reason: err instanceof Error ? err.message : "Lỗi không xác định",
        });
      }
    });
  }

  function exportFilteredExcel() {
    if (!session) return;
    downloadCsv(
      `kiem-ke-${session.countNo}.csv`,
      [
        "Mã phiên",
        "Mã hàng",
        "Tên sản phẩm",
        "Thương hiệu",
        "Danh mục",
        "Hàm lượng",
        "Định lượng",
        "Tồn đầu",
        "Nhập trong ngày",
        "Xuất trong ngày",
        "Ngày nhập",
        "Tồn hệ thống",
        "Tổng số chỉ",
        "Thực tế",
        "Lệch",
        "Trạng thái dòng",
      ],
      filteredItems.map((line) => [
        session.countNo,
        line.sku,
        line.name,
        line.brandName || "Không brand",
        line.category ?? "",
        line.purity ?? "",
        line.weightChi,
        line.openingQty,
        line.qtyIn,
        line.qtyOut,
        line.lastReceivedAt ? formatViDate(line.lastReceivedAt) : "",
        line.systemQty,
        systemTotalChi(line.systemQty, line.weightChi),
        line.actualQty ?? "",
        line.difference ?? "",
        LINE_STATUS_LABEL[line.lineStatus],
      ]),
    );
  }

  const selectedCategoryName =
    scopeType === "CATEGORY" ? categoryNameById[scopeValue] ?? scopeValue : null;

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold">Kiểm kê kho</h1>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Lấy số tồn trên hệ thống → đếm thực tế → duyệt → hệ thống tự điều chỉnh kho nếu có
              chênh lệch.
            </p>
          </div>
          {canMutate ? (
            <button
              type="button"
              onClick={() => setCreating((value) => !value)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
            >
              <Plus size={14} weight="bold" />
              Tạo phiên kiểm kê
            </button>
          ) : (
            <p className="rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[12px] text-[var(--tlkv-muted)]">
              Chỉ xem — không tạo/duyệt kiểm kê.
            </p>
          )}
        </div>

        {canMutate && creating ? (
          <div className="mt-4 space-y-3 rounded-lg border border-[var(--tlkv-line)] p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select
                value={scopeType}
                onChange={(event) => setScopeType(event.target.value as "ALL" | "CATEGORY")}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              >
                <option value="ALL">Toàn kho</option>
                <option value="CATEGORY">Theo danh mục</option>
              </select>
              {scopeType === "CATEGORY" ? (
                <select
                  value={scopeValue}
                  onChange={(event) => setScopeValue(event.target.value)}
                  className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] md:col-span-2"
                >
                  <option value="">Chọn danh mục</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="h-10 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[13px] text-[var(--tlkv-muted)] md:col-span-2">
                  Tất cả mã hàng đang kinh doanh
                </div>
              )}
              <button
                type="button"
                disabled={pending || (scopeType === "CATEGORY" && !scopeValue)}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const created = await createStockCount({
                        scopeType,
                        scopeValue: scopeType === "CATEGORY" ? scopeValue : null,
                      });
                      resetItemFilters();
                      setSession(created);
                      setCreating(false);
                      await refreshList();
                      setAlert({
                        tone: "success",
                        title: "Đã tạo phiên kiểm kê",
                        reason: `${created.countNo} · ${created.summary.totalLines} mã hàng trong phạm vi.`,
                      });
                    } catch (err) {
                      setAlert({
                        tone: "error",
                        title: "Không tạo được phiên kiểm kê",
                        reason: err instanceof Error ? err.message : "Lỗi không xác định",
                      });
                    }
                  })
                }
                className="h-10 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Đang tạo..." : "Bắt đầu kiểm kê"}
              </button>
            </div>
            <p className="text-[12px] text-[var(--tlkv-muted)]">
              Phạm vi:{" "}
              <strong>
                {scopeType === "ALL"
                  ? "Toàn kho"
                  : selectedCategoryName
                    ? `Danh mục ${selectedCategoryName}`
                    : "Chưa chọn danh mục"}
              </strong>
              . Hệ thống sẽ chốt danh sách mã hàng theo phạm vi khi bắt đầu.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <label className="relative min-w-[200px] flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
            />
            <input
              value={listQuery}
              onChange={(event) => {
                setListQuery(event.target.value);
                setListPage(0);
              }}
              placeholder="Tìm mã phiên kiểm kê..."
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <select
            value={listScope}
            onChange={(event) => {
              setListScope(event.target.value as typeof listScope);
              setListPage(0);
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            aria-label="Phạm vi kiểm kê"
          >
            <option value="">Tất cả phạm vi</option>
            <option value="ALL">Toàn kho</option>
            <option value="CATEGORY">Theo danh mục</option>
          </select>
          <select
            value={listStatus}
            onChange={(event) => {
              setListStatus(event.target.value as typeof listStatus);
              setListPage(0);
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            aria-label="Trạng thái phiên"
          >
            <option value="">Tất cả trạng thái</option>
            {(Object.keys(COUNT_STATUS_LABEL) as StockCountStatus[]).map((status) => (
              <option key={status} value={status}>
                {COUNT_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={listFrom}
            onChange={(event) => {
              setListFrom(event.target.value);
              setListPage(0);
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            aria-label="Từ ngày"
          />
          <input
            type="date"
            value={listTo}
            onChange={(event) => {
              setListTo(event.target.value);
              setListPage(0);
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            aria-label="Đến ngày"
          />
          <select
            value={listSort}
            onChange={(event) => setListSort(event.target.value as typeof listSort)}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            aria-label="Sắp xếp"
          >
            <option value="created_desc">Mới nhất</option>
            <option value="created_asc">Cũ nhất</option>
            <option value="status">Theo trạng thái</option>
          </select>
          <button
            type="button"
            onClick={resetListFilters}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
          >
            Làm mới bộ lọc
          </button>
        </div>

        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Mã phiên</th>
              <th className="py-2 font-medium">Phạm vi</th>
              <th className="py-2 font-medium">Trạng thái</th>
              <th className="py-2 font-medium">Người tạo</th>
              <th className="py-2 font-medium">Thời gian tạo</th>
            </tr>
          </thead>
          <tbody>
            {pagedList.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-[var(--tlkv-muted)]">
                  {list.items.length === 0
                    ? "Chưa có phiên kiểm kê."
                    : "Không có phiên khớp bộ lọc."}
                </td>
              </tr>
            ) : (
              pagedList.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-[var(--tlkv-line)] last:border-b-0 hover:bg-[var(--tlkv-bg)]"
                  onClick={() => openSession(row.id)}
                >
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openSession(row.id);
                      }}
                      className="font-semibold text-[var(--tlkv-red)] hover:underline"
                    >
                      {row.countNo}
                    </button>
                  </td>
                  <td className="py-3">{formatScope(row.scopeType, row.scopeValue)}</td>
                  <td className="py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="py-3 text-[var(--tlkv-muted)]">{row.actorEmail || "—"}</td>
                  <td className="py-3 text-[var(--tlkv-muted)]">
                    {formatViDateTime(row.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--tlkv-muted)]">
          <p>
            Hiển thị {filteredList.length === 0 ? 0 : safeListPage * listPageSize + 1}–
            {Math.min((safeListPage + 1) * listPageSize, filteredList.length)} / {filteredList.length}
            {list.total > list.items.length
              ? ` (đã tải ${list.items.length}/${list.total})`
              : ""}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={listPageSize}
              onChange={(event) => {
                setListPageSize(Number(event.target.value) as (typeof LIST_PAGE_SIZES)[number]);
                setListPage(0);
              }}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2"
            >
              {LIST_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}/trang
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={safeListPage === 0}
              onClick={() => setListPage(safeListPage - 1)}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
            >
              Trước
            </button>
            <span>
              {safeListPage + 1}/{listPageCount}
            </span>
            <button
              type="button"
              disabled={safeListPage + 1 >= listPageCount}
              onClick={() => setListPage(safeListPage + 1)}
              className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      </section>

      {session ? (
        <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold">{session.countNo}</h2>
              <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
                Kho {session.warehouse} · {formatScope(session.scopeType, session.scopeValue)} ·{" "}
                {COUNT_STATUS_LABEL[session.status]} · Ngày kiểm kê{" "}
                {formatViDate(formatVnIsoDate(session.createdAt))}
                {session.actorEmail ? ` · ${session.actorEmail}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportFilteredExcel}
                disabled={pending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium disabled:opacity-40"
              >
                <FileXls size={14} />
                Xuất Excel
              </button>
              {canSubmit ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        setSession(await submitStockCount(session.id));
                        await refreshList();
                        setAlert({
                          tone: "success",
                          title: "Đã gửi duyệt",
                          reason: `Khớp ${session.summary.matchCount} · Thừa ${session.summary.excessCount} · Thiếu ${session.summary.lackCount}.`,
                        });
                      } catch (err) {
                        setAlert({
                          tone: "error",
                          title: "Không gửi duyệt được",
                          reason: err instanceof Error ? err.message : "Lỗi",
                        });
                      }
                    })
                  }
                  className="h-9 rounded-lg bg-[var(--tlkv-amber)] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  {pending ? "Đang gửi..." : "Gửi duyệt"}
                </button>
              ) : null}
              {canEdit && (session.summary.pendingCount ?? 0) > 0 ? (
                <p className="flex h-9 items-center rounded-lg bg-[var(--tlkv-amber-soft)] px-3 text-[12px] text-[var(--tlkv-amber)]">
                  Còn {session.summary.pendingCount} mã chưa nhập — chưa gửi duyệt được.
                </p>
              ) : null}
              {canApprove ? (
                <>
                  <input
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="Lý do từ chối..."
                    className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px]"
                  />
                  <button
                    type="button"
                    disabled={pending || !rejectReason.trim()}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          setSession(await rejectStockCount(session.id, rejectReason));
                          await refreshList();
                        } catch (err) {
                          setAlert({
                            tone: "error",
                            title: "Không từ chối được",
                            reason: err instanceof Error ? err.message : "Lỗi",
                          });
                        }
                      })
                    }
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] disabled:opacity-40"
                  >
                    <XCircle size={14} />
                    Từ chối
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          setSession(await approveStockCount(session.id));
                          await refreshList();
                          setAlert({
                            tone: "success",
                            title: "Đã duyệt kiểm kê",
                            reason:
                              "Chênh lệch đã được cập nhật vào kho và ghi vào lịch sử biến động.",
                          });
                        } catch (err) {
                          setAlert({
                            tone: "error",
                            title: "Không duyệt được",
                            reason: err instanceof Error ? err.message : "Lỗi",
                          });
                        }
                      })
                    }
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-[var(--tlkv-green)] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    <Check size={14} weight="bold" />
                    Duyệt & cập nhật kho
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <SummaryCard label="Tổng dòng (phiên)" value={session.summary.totalLines} />
            <SummaryCard label="Khớp" value={session.summary.matchCount} tone="green" />
            <SummaryCard label="Thừa" value={session.summary.excessCount} tone="amber" />
            <SummaryCard label="Thiếu" value={session.summary.lackCount} tone="red" />
            <SummaryCard label="Chưa nhập" value={session.summary.pendingCount} />
          </div>
          <p className="mt-2 text-[11px] text-[var(--tlkv-muted)]">
            Theo bộ lọc đang chọn: {filteredSummary.totalLines} dòng · Khớp{" "}
            {filteredSummary.matchCount} · Thừa {filteredSummary.excessCount} · Thiếu{" "}
            {filteredSummary.lackCount} · Chưa nhập {filteredSummary.pendingCount}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={itemQuery}
              onChange={(event) => setItemQuery(event.target.value)}
              placeholder="Tìm mã hàng / tên sản phẩm..."
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <select
              value={itemBrand}
              onChange={(event) => setItemBrand(event.target.value)}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả thương hiệu</option>
              <option value="__none__">Không brand</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <select
              value={itemCategory}
              onChange={(event) => setItemCategory(event.target.value)}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả danh mục</option>
              {itemCategories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={itemProductTypeId}
              onChange={(event) => setItemProductTypeId(event.target.value)}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả loại sản phẩm</option>
              {itemProductTypeOptions.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
              {itemProductTypeOptions.hasNone ? (
                <option value="__none__">Chưa phân loại</option>
              ) : null}
            </select>
            <select
              value={itemLineStatus}
              onChange={(event) =>
                setItemLineStatus(event.target.value as typeof itemLineStatus)
              }
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả trạng thái dòng</option>
              {(Object.keys(LINE_STATUS_LABEL) as StockCountLineStatus[]).map((status) => (
                <option key={status} value={status}>
                  {LINE_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
            <select
              value={itemScopeView}
              onChange={(event) =>
                setItemScopeView(event.target.value as typeof itemScopeView)
              }
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="ALL">Toàn bộ mã trong phiên</option>
              <option value="INCOMPLETE">Chỉ mã chưa nhập</option>
            </select>
            <button
              type="button"
              onClick={resetItemFilters}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium hover:bg-[var(--tlkv-bg)]"
            >
              Xóa lọc dòng
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-[13px]">
              <thead className="text-[12px] text-[var(--tlkv-muted)]">
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className="py-2 font-medium">Mã hàng</th>
                  <th className="py-2 font-medium">Tên sản phẩm</th>
                  <th className="py-2 font-medium">Thương hiệu</th>
                  <th className="py-2 font-medium">Định lượng</th>
                  <th className="py-2 font-medium">Tồn đầu</th>
                  <th className="py-2 font-medium">Nhập trong ngày</th>
                  <th className="py-2 font-medium">Xuất trong ngày</th>
                  <th className="py-2 font-medium">Ngày nhập</th>
                  <th className="py-2 font-medium">Tồn hệ thống</th>
                  <th className="py-2 font-medium">Tổng số chỉ</th>
                  <th className="py-2 font-medium">Thực tế</th>
                  <th className="py-2 font-medium">Lệch</th>
                  <th className="py-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-6 text-[var(--tlkv-muted)]">
                      Không có dòng khớp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((line) => (
                    <tr
                      key={line.id}
                      className={`border-b border-[var(--tlkv-line)] ${
                        line.lineStatus === "PENDING"
                          ? "bg-[var(--tlkv-bg)]/40"
                          : line.lineStatus === "LACK"
                            ? "bg-[var(--tlkv-red-soft)]/30"
                            : line.lineStatus === "EXCESS"
                              ? "bg-[var(--tlkv-amber-soft)]/30"
                              : ""
                      }`}
                    >
                      <td className="py-2.5 font-semibold text-[var(--tlkv-red)]">{line.sku}</td>
                      <td className="py-2.5 font-medium">{line.name}</td>
                      <td className="py-2.5 text-[var(--tlkv-muted)]">
                        {line.brandName || "Không brand"}
                      </td>
                      <td className="py-2.5 tabular-nums text-[var(--tlkv-muted)]">
                        {formatWeightChi(line.weightChi)}
                      </td>
                      <td className="py-2.5 tabular-nums">{line.openingQty}</td>
                      <td className="py-2.5 tabular-nums">{line.qtyIn}</td>
                      <td className="py-2.5 tabular-nums">{line.qtyOut}</td>
                      <td className="py-2.5 whitespace-nowrap tabular-nums text-[var(--tlkv-muted)]">
                        {line.lastReceivedAt ? formatViDate(line.lastReceivedAt) : "—"}
                      </td>
                      <td className="py-2.5 tabular-nums">{line.systemQty}</td>
                      <td className="py-2.5 tabular-nums font-medium">
                        {formatSystemTotalChi(line.systemQty, line.weightChi)}
                      </td>
                      <td className="py-2.5">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            key={`${line.id}-${line.actualQty ?? "empty"}`}
                            defaultValue={line.actualQty ?? ""}
                            onBlur={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isNaN(value) || value < 0) return;
                              if (line.actualQty != null && value === line.actualQty) return;
                              startTransition(async () => {
                                try {
                                  setSession(
                                    await updateStockCountItem(session.id, line.skuId, value),
                                  );
                                } catch (err) {
                                  setAlert({
                                    tone: "error",
                                    title: "Không lưu được số liệu",
                                    reason: err instanceof Error ? err.message : "Lỗi",
                                  });
                                }
                              });
                            }}
                            className="h-8 w-20 rounded-md border border-[var(--tlkv-line)] px-2"
                          />
                        ) : (
                          (line.actualQty ?? "—")
                        )}
                      </td>
                      <td className="py-2.5">{line.difference ?? "—"}</td>
                      <td className="py-2.5">
                        <LineBadge status={line.lineStatus} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
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
    </div>
  );
}

function StatusBadge({ status }: { status: StockCountSession["status"] }) {
  const tone =
    status === "COMPLETED"
      ? "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
      : status === "PENDING_APPROVAL"
        ? "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
        : status === "REJECTED"
          ? "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
          : "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {COUNT_STATUS_LABEL[status]}
    </span>
  );
}

function LineBadge({ status }: { status: StockCountSession["items"][number]["lineStatus"] }) {
  const tone =
    status === "MATCH"
      ? "text-[var(--tlkv-green)]"
      : status === "EXCESS"
        ? "text-[var(--tlkv-amber)]"
        : status === "LACK"
          ? "text-[var(--tlkv-red)]"
          : "text-[var(--tlkv-muted)]";
  return <span className={`text-[12px] font-semibold ${tone}`}>{LINE_STATUS_LABEL[status]}</span>;
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red";
}) {
  const bg =
    tone === "green"
      ? "bg-[var(--tlkv-green-soft)]"
      : tone === "amber"
        ? "bg-[var(--tlkv-amber-soft)]"
        : tone === "red"
          ? "bg-[var(--tlkv-red-soft)]"
          : "bg-[var(--tlkv-bg)]";
  return (
    <div className={`rounded-lg px-3 py-2 ${bg}`}>
      <p className="text-[11px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="text-[18px] font-bold">{value}</p>
    </div>
  );
}
