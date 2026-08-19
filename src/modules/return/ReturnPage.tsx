"use client";

import { useRef, useState, useTransition } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { completeReturn, lookupReturnInvoice } from "./actions";
import {
  RETURN_CONDITION_LABEL,
  RETURN_CONDITIONS,
  RETURN_REASONS,
  type ReturnInvoiceLookup,
} from "./types";

export function ReturnPage() {
  const idempotencyKey = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [invoice, setInvoice] = useState<ReturnInvoiceLookup | null>(null);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<(typeof RETURN_REASONS)[number]>(RETURN_REASONS[0]);
  const [condition, setCondition] = useState<(typeof RETURN_CONDITIONS)[number]>("NEW");
  const [refundMethod, setRefundMethod] = useState<"CASH" | "TRANSFER" | "CARD">("CASH");
  const [note, setNote] = useState("");
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [pending, startTransition] = useTransition();

  const returnTotal = invoice
    ? invoice.items.reduce((sum, item) => {
        const qty = qtyMap[item.saleItemId] ?? 0;
        return sum + qty * item.unitPriceDong;
      }, 0)
    : 0;

  function search() {
    startTransition(async () => {
      try {
        const found = await lookupReturnInvoice(query);
        if (!found) {
          setInvoice(null);
          setAlert({
            tone: "error",
            title: "Không tìm thấy hóa đơn",
            reason: "Thử mã HĐ hoặc SĐT khách hàng.",
          });
          return;
        }
        setInvoice(found);
        setQtyMap({});
      } catch (err) {
        setAlert({
          tone: "error",
          title: "Không tra cứu được",
          reason: err instanceof Error ? err.message : "Lỗi",
        });
      }
    });
  }

  function submitReturn() {
    if (!invoice) return;
    const items = invoice.items
      .map((item) => ({ sale_item_id: item.saleItemId, quantity: qtyMap[item.saleItemId] ?? 0 }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) {
      setAlert({
        tone: "error",
        title: "Chưa chọn sản phẩm trả",
        reason: "Chọn ít nhất một dòng với số lượng > 0.",
      });
      return;
    }
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();

    startTransition(async () => {
      try {
        const result = await completeReturn({
          invoiceNo: invoice.invoiceNo,
          reason,
          itemCondition: condition,
          refundMethod,
          note,
          idempotencyKey: idempotencyKey.current!,
          items,
        });
        idempotencyKey.current = null;
        setInvoice(null);
        setQtyMap({});
        setQuery("");
        setAlert({
          tone: "success",
          title: "Trả hàng thành công",
          reason: `Phiếu ${result.return_no} · Hoàn ${formatDong(result.total_dong)} · Kho đã nhập lại.`,
        });
      } catch (err) {
        setAlert({
          tone: "error",
          title: "Không hoàn tất trả hàng",
          reason: err instanceof Error ? err.message : "Lỗi",
          detail: "Sale gốc không đổi. Có thể thử lại cùng phiên.",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <h1 className="text-[18px] font-semibold">Trả hàng</h1>
        <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
          Tìm hóa đơn → chọn dòng trả → hoàn tiền. Sale gốc giữ nguyên, kho ghi CUSTOMER_RETURN.
        </p>
        <div className="mt-4 flex gap-2">
          <label className="relative flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && search()}
              placeholder="Mã HĐ hoặc SĐT khách"
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px]"
            />
          </label>
          <button
            type="button"
            disabled={pending || !query.trim()}
            onClick={search}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Tìm HĐ
          </button>
        </div>
      </section>

      {invoice ? (
        <>
          <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-[16px] font-bold text-[var(--tlkv-red)]">{invoice.invoiceNo}</p>
                <p className="text-[13px] text-[var(--tlkv-muted)]">
                  {invoice.customerName} · {formatViDateTime(invoice.issuedAt)}
                </p>
              </div>
              <p className="text-[14px] font-semibold">{formatDong(invoice.totalDong)}</p>
            </div>
            <table className="mt-4 w-full text-left text-[13px]">
              <thead className="text-[12px] text-[var(--tlkv-muted)]">
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className="py-2 font-medium">Sản phẩm</th>
                  <th className="py-2 font-medium">Đã bán</th>
                  <th className="py-2 font-medium">Đã trả</th>
                  <th className="py-2 font-medium">Trả lần này</th>
                  <th className="py-2 text-right font-medium">Đơn giá</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.saleItemId} className="border-b border-[var(--tlkv-line)]">
                    <td className="py-2.5">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-[12px] text-[var(--tlkv-muted)]">{item.sku}</p>
                    </td>
                    <td className="py-2.5">{item.soldQty}</td>
                    <td className="py-2.5">{item.returnedQty}</td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        min={0}
                        max={item.availableQty}
                        value={qtyMap[item.saleItemId] ?? ""}
                        disabled={item.availableQty <= 0}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setQtyMap((current) => ({
                            ...current,
                            [item.saleItemId]: Number.isNaN(value) ? 0 : value,
                          }));
                        }}
                        className="h-8 w-20 rounded-md border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
                      />
                    </td>
                    <td className="py-2.5 text-right">{formatDong(item.unitPriceDong)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="text-[13px]">
                Lý do trả
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value as (typeof RETURN_REASONS)[number])}
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3"
                >
                  {RETURN_REASONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[13px]">
                Tình trạng
                <select
                  value={condition}
                  onChange={(event) =>
                    setCondition(event.target.value as (typeof RETURN_CONDITIONS)[number])
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3"
                >
                  {RETURN_CONDITIONS.map((item) => (
                    <option key={item} value={item}>
                      {RETURN_CONDITION_LABEL[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[13px]">
                Hoàn tiền
                <select
                  value={refundMethod}
                  onChange={(event) =>
                    setRefundMethod(event.target.value as "CASH" | "TRANSFER" | "CARD")
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3"
                >
                  <option value="CASH">Tiền mặt</option>
                  <option value="TRANSFER">Chuyển khoản</option>
                  <option value="CARD">Thẻ</option>
                </select>
              </label>
            </div>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ghi chú trả hàng..."
              rows={2}
              className="mt-3 w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px]"
            />
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[13px] text-[var(--tlkv-muted)]">Tổng hoàn (snapshot giá bán)</p>
              <p className="text-[22px] font-bold text-[var(--tlkv-red)]">{formatDong(returnTotal)}</p>
            </div>
            <button
              type="button"
              disabled={pending || returnTotal <= 0}
              onClick={submitReturn}
              className="mt-4 h-10 w-full rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Xác nhận trả hàng
            </button>
          </section>
        </>
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
