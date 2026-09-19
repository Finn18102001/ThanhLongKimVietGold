"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileXls, MagnifyingGlass } from "@phosphor-icons/react";
import { downloadCsv } from "@/shared/lib/csv";
import { formatViDateTime } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import { exportForm02Rows, searchForm02 } from "./actions";
import { Form02DetailDrawer } from "./components/Form02DetailDrawer";
import type { Form02Line, Form02ListPage } from "./types";

const PAGE_SIZES = [25, 50, 100] as const;
const SEARCH_DEBOUNCE_MS = 350;

function formatWeightQty(line: Form02Line): string {
  const weight = Number(line.weightChi);
  if (!Number.isFinite(weight)) return "—";
  return `${weight.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} chỉ`;
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return formatDong(value);
}

export function Form02Directory({ initial }: { initial: Form02ListPage }) {
  const [page, setPage] = useState(initial);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [docNo, setDocNo] = useState("");
  const [seller, setSeller] = useState("");
  const [actor, setActor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detailBuyId, setDetailBuyId] = useState<string | null>(null);
  const [detailForm02No, setDetailForm02No] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const docTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sellerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const currentPage = Math.floor(page.offset / page.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  useEffect(() => {
    return () => {
      if (docTimerRef.current) clearTimeout(docTimerRef.current);
      if (sellerTimerRef.current) clearTimeout(sellerTimerRef.current);
      if (actorTimerRef.current) clearTimeout(actorTimerRef.current);
    };
  }, []);

  function refresh(next: {
    from?: string;
    to?: string;
    docNo?: string;
    seller?: string;
    actor?: string;
    limit?: number;
    offset?: number;
  }) {
    const nextFrom = next.from ?? from;
    const nextTo = next.to ?? to;
    const nextDocNo = next.docNo ?? docNo;
    const nextSeller = next.seller ?? seller;
    const nextActor = next.actor ?? actor;
    const nextLimit = next.limit ?? page.limit;
    const nextOffset = next.offset ?? 0;
    const seq = ++requestSeqRef.current;
    startTransition(async () => {
      try {
        const result = await searchForm02({
          from: nextFrom || null,
          to: nextTo || null,
          docNo: nextDocNo || null,
          seller: nextSeller || null,
          actor: nextActor || null,
          limit: nextLimit,
          offset: nextOffset,
        });
        if (seq !== requestSeqRef.current) return;
        setPage(result);
        setError(null);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        setError(err instanceof Error ? err.message : "Không tải được Phiếu 02.");
      }
    });
  }

  function scheduleDocNo(value: string) {
    setDocNo(value);
    if (docTimerRef.current) clearTimeout(docTimerRef.current);
    docTimerRef.current = setTimeout(() => refresh({ docNo: value, offset: 0 }), SEARCH_DEBOUNCE_MS);
  }

  function scheduleSeller(value: string) {
    setSeller(value);
    if (sellerTimerRef.current) clearTimeout(sellerTimerRef.current);
    sellerTimerRef.current = setTimeout(() => refresh({ seller: value, offset: 0 }), SEARCH_DEBOUNCE_MS);
  }

  function scheduleActor(value: string) {
    setActor(value);
    if (actorTimerRef.current) clearTimeout(actorTimerRef.current);
    actorTimerRef.current = setTimeout(() => refresh({ actor: value, offset: 0 }), SEARCH_DEBOUNCE_MS);
  }

  async function onExport() {
    startTransition(async () => {
      try {
        const result = await exportForm02Rows({
          from: from || null,
          to: to || null,
          docNo: docNo || null,
          seller: seller || null,
          actor: actor || null,
        });
        downloadCsv(
          "phieu-02.csv",
          [
            "STT",
            "Ngày tháng năm mua hàng",
            "Tên người bán",
            "Địa chỉ",
            "Số căn cước",
            "Số điện thoại",
            "Tên hàng hóa/dịch vụ",
            "Số lượng/Trọng lượng",
            "Đơn giá",
            "Tổng giá thanh toán",
            "Số hóa đơn",
            "Mã giao dịch",
            "Nhân viên mua",
          ],
          result.items.map((line, index) => [
            index + 1,
            formatViDateTime(line.purchasedAt),
            line.sellerName ?? "",
            line.sellerAddress ?? "",
            line.sellerCitizenId ?? "",
            line.sellerPhone ?? "",
            line.productName,
            formatWeightQty(line),
            line.unitPriceDong,
            line.lineTotalDong,
            line.form02No,
            line.buyNo,
            line.actorEmail ?? "",
          ]),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không xuất được Excel.");
      }
    });
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[18px] font-semibold">Quản lý Phiếu 02</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-[var(--tlkv-muted)]">
            Tổng hợp bảng kê thu mua hàng hóa, dịch vụ không có hóa đơn (Mẫu 02/TNDN). Chỉ xem, lọc và
            xuất Excel theo bộ lọc hiện tại.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={pending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          <FileXls size={16} weight="bold" />
          Xuất Excel
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Từ ngày
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              refresh({ from: event.target.value, offset: 0 });
            }}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Đến ngày
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              refresh({ to: event.target.value, offset: 0 });
            }}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="relative text-[12px] text-[var(--tlkv-muted)]">
          Số hóa đơn
          <MagnifyingGlass
            size={14}
            className="pointer-events-none absolute top-[34px] left-3 text-[var(--tlkv-muted)]"
          />
          <input
            value={docNo}
            onChange={(event) => scheduleDocNo(event.target.value)}
            placeholder="BK… / BUY…"
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-8 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Tên người bán
          <input
            value={seller}
            onChange={(event) => scheduleSeller(event.target.value)}
            placeholder="Tên khách bán"
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
          />
        </label>
        <label className="text-[12px] text-[var(--tlkv-muted)]">
          Nhân viên mua vàng
          <input
            value={actor}
            onChange={(event) => scheduleActor(event.target.value)}
            placeholder="Email nhân viên"
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
              <th className="py-2 pr-2 font-medium">STT</th>
              <th className="py-2 pr-2 font-medium">Ngày mua hàng</th>
              <th className="py-2 pr-2 font-medium">Tên người bán</th>
              <th className="py-2 pr-2 font-medium">Địa chỉ</th>
              <th className="py-2 pr-2 font-medium">Số căn cước</th>
              <th className="py-2 pr-2 font-medium">Số điện thoại</th>
              <th className="py-2 pr-2 font-medium">Tên hàng hóa/dịch vụ</th>
              <th className="py-2 pr-2 font-medium">Số lượng/Trọng lượng</th>
              <th className="py-2 pr-2 font-medium">Đơn giá</th>
              <th className="py-2 pr-2 font-medium">Tổng giá thanh toán</th>
              <th className="py-2 pr-2 font-medium">Số HĐ / Mã GD</th>
              <th className="py-2 font-medium">NV mua</th>
            </tr>
          </thead>
          <tbody>
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-[var(--tlkv-muted)]">
                  Không có Phiếu 02 phù hợp bộ lọc.
                </td>
              </tr>
            ) : (
              page.items.map((line) => (
                <tr
                  key={`${line.buyId}-${line.itemId}`}
                  className="cursor-pointer border-b border-[var(--tlkv-line)] hover:bg-[var(--tlkv-bg)]"
                  onClick={() => {
                    setDetailBuyId(line.buyId);
                    setDetailForm02No(line.form02No);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailBuyId(line.buyId);
                      setDetailForm02No(line.form02No);
                    }
                  }}
                  tabIndex={0}
                  title="Xem chi tiết Phiếu 02"
                >
                  <td className="py-2.5 pr-2 tabular-nums">{line.stt}</td>
                  <td className="py-2.5 pr-2 whitespace-nowrap tabular-nums">
                    {formatViDateTime(line.purchasedAt)}
                  </td>
                  <td className="py-2.5 pr-2">{line.sellerName || "—"}</td>
                  <td className="max-w-[180px] py-2.5 pr-2">{line.sellerAddress || "—"}</td>
                  <td className="py-2.5 pr-2 tabular-nums">{line.sellerCitizenId || "—"}</td>
                  <td className="py-2.5 pr-2 tabular-nums">{line.sellerPhone || "—"}</td>
                  <td className="py-2.5 pr-2">{line.productName || "—"}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums">{formatWeightQty(line)}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums">{formatMoney(line.unitPriceDong)}</td>
                  <td className="py-2.5 pr-2 text-right font-medium tabular-nums">
                    {formatMoney(line.lineTotalDong)}
                  </td>
                  <td className="py-2.5 pr-2">
                    <div className="font-medium text-[var(--tlkv-red)]">{line.form02No}</div>
                    <div className="text-[12px] text-[var(--tlkv-muted)]">{line.buyNo}</div>
                  </td>
                  <td className="py-2.5 text-[12px]">{line.actorEmail || "—"}</td>
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

      {detailBuyId ? (
        <Form02DetailDrawer
          buyId={detailBuyId}
          form02NoHint={detailForm02No}
          onClose={() => {
            setDetailBuyId(null);
            setDetailForm02No(null);
          }}
        />
      ) : null}
    </section>
  );
}
