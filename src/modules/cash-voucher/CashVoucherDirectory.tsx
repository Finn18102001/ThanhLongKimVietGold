"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { formatViDateTime } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import { ROUTES } from "@/shared/navigation/routes";
import { searchCashVouchers } from "./actions";
import { CashVoucherDetailDrawer } from "./components/CashVoucherDetailDrawer";
import type { CashVoucherListFilter, CashVoucherListPage, CashVoucherRow } from "./types";

const PAGE_SIZES = [25, 50, 100] as const;
const SEARCH_DEBOUNCE_MS = 350;

function statusLabel(status: string): string {
  if (status === "CONFIRMED") return "Đã xác nhận";
  if (status === "REJECTED") return "Từ chối";
  if (status === "REVERSED") return "Đã đảo";
  return "Chờ xác nhận";
}

function statusClass(status: string): string {
  if (status === "CONFIRMED") return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  if (status === "REJECTED" || status === "REVERSED") {
    return "bg-[var(--tlkv-bg)] text-[var(--tlkv-muted)]";
  }
  return "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]";
}

function cashHolderLabel(row: CashVoucherRow): string {
  if (row.cashHolderName && row.cashAccountCode) {
    return `${row.cashHolderName} · ${row.cashAccountCode}`;
  }
  return row.cashHolderName || row.cashAccountCode || "—";
}

function goldHolderLabel(row: CashVoucherRow): string {
  if (row.goldHolderName && row.goldAccountCode) {
    return `${row.goldHolderName} · ${row.goldAccountCode}`;
  }
  return row.goldHolderName || row.goldAccountCode || "—";
}

function confirmerLabel(row: CashVoucherRow): string {
  if (row.confirmedByEmail) return row.confirmedByEmail;
  if (row.rejectedByEmail) return row.rejectedByEmail;
  if (row.reversedByEmail) return row.reversedByEmail;
  return "—";
}

function str(v: string | null | undefined): string {
  return v?.trim() || "";
}

export function CashVoucherDirectory({
  initial,
  initialFilter,
}: {
  initial: CashVoucherListPage;
  initialFilter?: CashVoucherListFilter;
}) {
  const router = useRouter();
  const [page, setPage] = useState(initial);
  const [from, setFrom] = useState(str(initialFilter?.from));
  const [to, setTo] = useState(str(initialFilter?.to));
  const [code, setCode] = useState(str(initialFilter?.code));
  const [kind, setKind] = useState(str(initialFilter?.kind));
  const [status, setStatus] = useState(str(initialFilter?.status));
  const [createdBy, setCreatedBy] = useState(str(initialFilter?.createdBy));
  const [confirmedBy, setConfirmedBy] = useState(str(initialFilter?.confirmedBy));
  const [cashHolder, setCashHolder] = useState(str(initialFilter?.cashHolder));
  const [goldHolder, setGoldHolder] = useState(str(initialFilter?.goldHolder));
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const requestSeqRef = useRef(0);

  const currentPage = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  useEffect(() => {
    return () => {
      for (const t of Object.values(timers.current)) {
        if (t) clearTimeout(t);
      }
    };
  }, []);

  function refresh(next: {
    from?: string;
    to?: string;
    code?: string;
    kind?: string;
    status?: string;
    createdBy?: string;
    confirmedBy?: string;
    cashHolder?: string;
    goldHolder?: string;
    limit?: number;
    offset?: number;
  }) {
    const nextFrom = next.from ?? from;
    const nextTo = next.to ?? to;
    const nextCode = next.code ?? code;
    const nextKind = next.kind ?? kind;
    const nextStatus = next.status ?? status;
    const nextCreated = next.createdBy ?? createdBy;
    const nextConfirmed = next.confirmedBy ?? confirmedBy;
    const nextCash = next.cashHolder ?? cashHolder;
    const nextGold = next.goldHolder ?? goldHolder;
    const nextLimit = next.limit ?? page.limit;
    const nextOffset = next.offset ?? 0;
    const seq = ++requestSeqRef.current;
    const qs = new URLSearchParams();
    if (nextFrom) qs.set("from", nextFrom);
    if (nextTo) qs.set("to", nextTo);
    if (nextCode) qs.set("code", nextCode);
    if (nextKind) qs.set("kind", nextKind);
    if (nextStatus) qs.set("status", nextStatus);
    if (nextCreated) qs.set("createdBy", nextCreated);
    if (nextConfirmed) qs.set("confirmedBy", nextConfirmed);
    if (nextCash) qs.set("cashHolder", nextCash);
    if (nextGold) qs.set("goldHolder", nextGold);
    if (nextLimit !== 50) qs.set("limit", String(nextLimit));
    if (nextOffset > 0) qs.set("offset", String(nextOffset));
    const href = qs.toString()
      ? `${ROUTES.cashVouchers}?${qs.toString()}`
      : ROUTES.cashVouchers;

    startTransition(async () => {
      try {
        const result = await searchCashVouchers({
          from: nextFrom || null,
          to: nextTo || null,
          code: nextCode || null,
          kind: nextKind || null,
          status: nextStatus || null,
          createdBy: nextCreated || null,
          confirmedBy: nextConfirmed || null,
          cashHolder: nextCash || null,
          goldHolder: nextGold || null,
          limit: nextLimit,
          offset: nextOffset,
        });
        if (seq !== requestSeqRef.current) return;
        setPage(result);
        setError(null);
        router.replace(href, { scroll: false });
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        setError(err instanceof Error ? err.message : "Không tải được phiếu thu/chi.");
      }
    });
  }

  function schedule(key: string, value: string, apply: (v: string) => void) {
    apply(value);
    if (timers.current[key]) clearTimeout(timers.current[key]!);
    timers.current[key] = setTimeout(() => {
      const patch: Record<string, string | number> = { offset: 0 };
      patch[key] = value;
      refresh(patch as Parameters<typeof refresh>[0]);
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div>
        <h1 className="text-[18px] font-semibold">Quản lý phiếu thu/chi</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-[var(--tlkv-muted)]">
          Tổng hợp yêu cầu thu/chi Quỹ tiền: người tạo, người xác nhận, ai cầm quỹ tiền / quỹ vàng
          gắn chứng từ. Chỉ xem, lọc và phân trang.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Từ ngày
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              refresh({ from: e.target.value, offset: 0 });
            }}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Đến ngày
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              refresh({ to: e.target.value, offset: 0 });
            }}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="relative text-[12px] text-[var(--tlkv-muted)]">
          Mã phiếu / chứng từ
          <MagnifyingGlass
            size={14}
            className="pointer-events-none absolute top-[34px] left-3 text-[var(--tlkv-muted)]"
          />
          <input
            value={code}
            onChange={(e) => schedule("code", e.target.value, setCode)}
            placeholder="YC-THU… / HD… / BUY…"
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-8 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Loại
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              refresh({ kind: e.target.value, offset: 0 });
            }}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            <option value="">Tất cả</option>
            <option value="THU">Thu</option>
            <option value="CHI">Chi</option>
          </select>
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Trạng thái
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              refresh({ status: e.target.value, offset: 0 });
            }}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          >
            <option value="">Tất cả</option>
            <option value="PENDING">Chờ xác nhận</option>
            <option value="CONFIRMED">Đã xác nhận</option>
            <option value="REJECTED">Từ chối</option>
            <option value="REVERSED">Đã đảo</option>
          </select>
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Người tạo
          <input
            value={createdBy}
            onChange={(e) => schedule("createdBy", e.target.value, setCreatedBy)}
            placeholder="Email người tạo"
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Người xác nhận / từ chối
          <input
            value={confirmedBy}
            onChange={(e) => schedule("confirmedBy", e.target.value, setConfirmedBy)}
            placeholder="Email Quỹ tiền"
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Người cầm Quỹ tiền
          <input
            value={cashHolder}
            onChange={(e) => schedule("cashHolder", e.target.value, setCashHolder)}
            placeholder="Tên / mã QT…"
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Người cầm Quỹ vàng
          <input
            value={goldHolder}
            onChange={(e) => schedule("goldHolder", e.target.value, setGoldHolder)}
            placeholder="Tên / mã QV…"
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-[var(--tlkv-red-soft)] px-3 py-2 text-[13px] text-[var(--tlkv-red)]">
          {error}
        </p>
      ) : null}

      <div className={`mt-4 overflow-x-auto ${pending ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[1280px] text-left text-[13px]">
          <thead className="text-[12px] text-[var(--tlkv-muted)]">
            <tr className="border-b border-[var(--tlkv-line)]">
              <th className="py-2 pr-2 font-medium">Mã phiếu</th>
              <th className="py-2 pr-2 font-medium">Loại</th>
              <th className="py-2 pr-2 font-medium">Trạng thái</th>
              <th className="py-2 pr-2 font-medium">Số tiền</th>
              <th className="py-2 pr-2 font-medium">Chứng từ</th>
              <th className="py-2 pr-2 font-medium">Người tạo</th>
              <th className="py-2 pr-2 font-medium">Quỹ tiền (người cầm)</th>
              <th className="py-2 pr-2 font-medium">Quỹ vàng (người cầm)</th>
              <th className="py-2 pr-2 font-medium">Xác nhận / từ chối</th>
              <th className="py-2 font-medium">Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-[var(--tlkv-muted)]">
                  Không có phiếu thu/chi phù hợp bộ lọc.
                </td>
              </tr>
            ) : (
              page.items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-[var(--tlkv-line)] hover:bg-[var(--tlkv-bg)]"
                  onClick={() => {
                    setDetailId(row.id);
                    setDetailCode(row.code);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailId(row.id);
                      setDetailCode(row.code);
                    }
                  }}
                  tabIndex={0}
                  title="Xem chi tiết phiếu thu/chi"
                >
                  <td className="py-2.5 pr-2 font-semibold text-[var(--tlkv-red)]">{row.code}</td>
                  <td className="py-2.5 pr-2">{row.kind === "CHI" ? "Chi" : "Thu"}</td>
                  <td className="py-2.5 pr-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(
                        row.status,
                      )}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-2 text-right font-medium tabular-nums">
                    {formatDong(row.amountDong)}
                  </td>
                  <td className="py-2.5 pr-2">
                    <div className="font-medium">{row.sourceCode || "—"}</div>
                    <div className="text-[12px] text-[var(--tlkv-muted)]">
                      {row.customerName || row.sourceType || ""}
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 text-[12px]">{row.createdByEmail || "—"}</td>
                  <td className="py-2.5 pr-2 text-[12px]">{cashHolderLabel(row)}</td>
                  <td className="py-2.5 pr-2 text-[12px]">{goldHolderLabel(row)}</td>
                  <td className="py-2.5 pr-2 text-[12px]">{confirmerLabel(row)}</td>
                  <td className="py-2.5 whitespace-nowrap text-[12px] tabular-nums">
                    {row.createdAt ? formatViDateTime(row.createdAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <p className="text-[var(--tlkv-muted)]">
          Hiển thị {page.total === 0 ? 0 : page.offset + 1} -{" "}
          {Math.min(page.offset + page.items.length, page.total)} trong {page.total} dòng
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1 || pending}
            onClick={() => refresh({ offset: Math.max(0, page.offset - page.limit) })}
            className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 disabled:opacity-40"
          >
            Trước
          </button>
          <span className="min-w-[72px] text-center">
            {currentPage}/{pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage >= pageCount || pending}
            onClick={() => refresh({ offset: page.offset + page.limit })}
            className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 disabled:opacity-40"
          >
            Sau
          </button>
          <select
            value={page.limit}
            onChange={(event) => {
              const limit = Number(event.target.value);
              refresh({ limit, offset: 0 });
            }}
            className="h-9 rounded-lg border border-[var(--tlkv-line)] px-2"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / trang
              </option>
            ))}
          </select>
        </div>
      </div>

      {detailId ? (
        <CashVoucherDetailDrawer
          requestId={detailId}
          codeHint={detailCode}
          onClose={() => {
            setDetailId(null);
            setDetailCode(null);
          }}
        />
      ) : null}
    </section>
  );
}
