"use client";

import { useState } from "react";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { receivePurchase } from "../actions";
import type { StockRow } from "../types";

export function ReceiveForm({ rows }: { rows: StockRow[] }) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [payMode, setPayMode] = useState<"FULL" | "PARTIAL" | "UNPAID">("UNPAID");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  async function onSubmit(formData: FormData) {
    if (pending) return;
    setPending(true);
    const skuId = String(formData.get("sku_id") ?? "");
    const sku = rows.find((row) => row.skuId === skuId);
    const received = Number(formData.get("received_qty") ?? 0);
    try {
      formData.set("pay_mode", payMode);
      const result = await receivePurchase(formData);
      setIdempotencyKey(crypto.randomUUID());
      setAlert({
        tone: "success",
        title: "Nhập hàng thành công",
        reason: `Đã nhận ${received} chiếc ${sku?.name ?? ""}. Tồn kho đã cộng, ghi giá vốn và lịch sử biến động.`,
        detail: `Phiếu ${result.receipt_no}. Thanh toán: ${result.paymentStatus ?? "UNPAID"}.`,
      });
    } catch (error) {
      setAlert({
        tone: "error",
        title: "Nhập hàng thất bại",
        reason: error instanceof Error ? error.message : "Không nhập được hàng.",
        detail: "Kho chưa thay đổi. Chưa tạo phiếu nhập hay bản ghi biến động.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h1 className="text-[15px] font-semibold">Nhập hàng</h1>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        Giá vốn là số nguyên VND / chiếc. Backend tính tổng giá vốn = giá vốn × số nhận và tự suy
        trạng thái thanh toán từ số đã trả.
      </p>
      <form action={onSubmit} className="mt-4 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="idempotency_key" value={idempotencyKey} />
        <label className="text-sm sm:col-span-2">
          Mã hàng
          <select name="sku_id" required className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3">
            {rows.map((row) => (
              <option key={row.skuId} value={row.skuId}>
                {row.sku} · {row.name}
                {row.brandName ? ` · ${row.brandName}` : ""} · tồn {row.quantity}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Dự kiến
          <input name="expected_qty" type="number" min={0} required defaultValue={0} className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3" />
        </label>
        <label className="text-sm">
          Nhận thực tế
          <input name="received_qty" type="number" min={1} required defaultValue={1} className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3" />
        </label>
        <label className="text-sm sm:col-span-2">
          Giá vốn / chiếc (VND, số nguyên)
          <input
            name="cost_price_dong"
            type="number"
            min={0}
            step={1}
            required
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Nhà cung cấp
          <input name="supplier_name" required className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3" />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm">Thanh toán phiếu nhập</legend>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {(
              [
                { value: "FULL" as const, label: "Đủ" },
                { value: "PARTIAL" as const, label: "Một phần" },
                { value: "UNPAID" as const, label: "Chưa TT" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPayMode(option.value)}
                className={`h-9 rounded-lg text-[12px] font-semibold ${
                  payMode === option.value
                    ? "bg-[var(--tlkv-red)] text-white"
                    : "border border-[var(--tlkv-line)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        {payMode === "PARTIAL" ? (
          <label className="text-sm sm:col-span-2">
            Số đã trả (VND)
            <input name="paid_dong" type="number" min={0} step={1} required className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3" />
          </label>
        ) : null}
        <label className="text-sm sm:col-span-2">
          Lý do
          <input name="reason" defaultValue="Nhập hàng" className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-[var(--tlkv-green)] px-4 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2"
        >
          {pending ? "Đang ghi..." : "Xác nhận nhận hàng"}
        </button>
      </form>
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
