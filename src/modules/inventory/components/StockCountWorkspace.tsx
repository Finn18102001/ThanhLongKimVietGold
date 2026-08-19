"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Plus, XCircle } from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
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
  type StockCountListRow,
  type StockCountSession,
} from "../count-types";

type CategoryOption = { id: string; name: string };

export function StockCountWorkspace({
  initialList,
  categories,
}: {
  initialList: { items: StockCountListRow[]; total: number };
  categories: CategoryOption[];
}) {
  const [list, setList] = useState(initialList);
  const [session, setSession] = useState<StockCountSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [scopeType, setScopeType] = useState<"ALL" | "CATEGORY">("ALL");
  const [scopeValue, setScopeValue] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [pending, startTransition] = useTransition();

  const canEdit = session?.status === "COUNTING" || session?.status === "DRAFT";
  const canSubmit = canEdit && (session?.summary.pendingCount ?? 0) === 0;
  const canApprove = session?.status === "PENDING_APPROVAL";

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  function formatScope(scopeType: "ALL" | "CATEGORY", scopeValue: string | null) {
    if (scopeType === "ALL") return "Toàn kho";
    return categoryNameById[scopeValue ?? ""] ?? scopeValue ?? "Danh mục";
  }

  async function refreshList() {
    setList(await listStockCounts());
  }

  function openSession(id: string) {
    startTransition(async () => {
      try {
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

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold">Kiểm kê kho</h1>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              Snapshot tồn hệ thống → nhập thực tế → duyệt → điều chỉnh kho qua sổ cái.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating((value) => !value)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
          >
            <Plus size={14} weight="bold" />
            Tạo phiên kiểm kê
          </button>
        </div>

        {creating ? (
          <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-[var(--tlkv-line)] p-3 md:grid-cols-4">
            <select
              value={scopeType}
              onChange={(event) => setScopeType(event.target.value as "ALL" | "CATEGORY")}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="ALL">Toàn kho</option>
              <option value="CATEGORY">Theo danh mục POS</option>
            </select>
            {scopeType === "CATEGORY" ? (
              <select
                value={scopeValue}
                onChange={(event) => setScopeValue(event.target.value)}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              >
                <option value="">Chọn danh mục</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="h-10 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[13px] text-[var(--tlkv-muted)]">
                Tất cả SKU đang active
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
                    setSession(created);
                    setCreating(false);
                    await refreshList();
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
              Bắt đầu kiểm kê
            </button>
          </div>
        ) : null}

        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 font-medium">Mã phiên</th>
              <th className="py-2 font-medium">Phạm vi</th>
              <th className="py-2 font-medium">Trạng thái</th>
              <th className="py-2 font-medium">Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {list.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-[var(--tlkv-muted)]">
                  Chưa có phiên kiểm kê.
                </td>
              </tr>
            ) : (
              list.items.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tlkv-line)] last:border-b-0">
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => openSession(row.id)}
                      className="font-semibold text-[var(--tlkv-red)] hover:underline"
                    >
                      {row.countNo}
                    </button>
                  </td>
                  <td className="py-3">
                    {formatScope(row.scopeType, row.scopeValue)}
                  </td>
                  <td className="py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="py-3 text-[var(--tlkv-muted)]">
                    {formatViDateTime(row.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {session ? (
        <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold">{session.countNo}</h2>
              <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
                Kho {session.warehouse} · {formatScope(session.scopeType, session.scopeValue)} ·{" "}
                {COUNT_STATUS_LABEL[session.status]}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSubmit ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        setSession(await submitStockCount(session.id));
                        await refreshList();
                      } catch (err) {
                        setAlert({
                          tone: "error",
                          title: "Không gửi duyệt được",
                          reason: err instanceof Error ? err.message : "Lỗi",
                        });
                      }
                    })
                  }
                  className="h-9 rounded-lg bg-[var(--tlkv-amber)] px-3 text-[12px] font-semibold text-white"
                >
                  Gửi duyệt
                </button>
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
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px]"
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
                            reason: "Chênh lệch đã ghi điều chỉnh kho và sổ cái.",
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
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-[var(--tlkv-green)] px-3 text-[12px] font-semibold text-white"
                  >
                    <Check size={14} weight="bold" />
                    Duyệt & cập nhật kho
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <SummaryCard label="Tổng dòng" value={session.summary.totalLines} />
            <SummaryCard label="Khớp" value={session.summary.matchCount} tone="green" />
            <SummaryCard label="Thừa" value={session.summary.excessCount} tone="amber" />
            <SummaryCard label="Thiếu" value={session.summary.lackCount} tone="red" />
            <SummaryCard label="Chưa nhập" value={session.summary.pendingCount} />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-[12px] text-[var(--tlkv-muted)]">
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className="py-2 font-medium">SKU</th>
                  <th className="py-2 font-medium">Tồn HT</th>
                  <th className="py-2 font-medium">Thực tế</th>
                  <th className="py-2 font-medium">Lệch</th>
                  <th className="py-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {session.items.map((line) => (
                  <tr key={line.id} className="border-b border-[var(--tlkv-line)]">
                    <td className="py-2.5">
                      <p className="font-medium">{line.name}</p>
                      <p className="text-[12px] text-[var(--tlkv-muted)]">{line.sku}</p>
                    </td>
                    <td className="py-2.5">{line.systemQty}</td>
                    <td className="py-2.5">
                      {canEdit ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={line.actualQty ?? ""}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isNaN(value) || value < 0) return;
                            startTransition(async () => {
                              try {
                                setSession(await updateStockCountItem(session.id, line.skuId, value));
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
                ))}
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
  const tone = useMemo(() => {
    if (status === "COMPLETED") return "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]";
    if (status === "PENDING_APPROVAL") return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
    if (status === "REJECTED") return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
    return "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]";
  }, [status]);
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
