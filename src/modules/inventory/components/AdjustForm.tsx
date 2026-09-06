"use client";

import { useState } from "react";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { ledgerTypeLabel } from "../labels";
import { adjustStock } from "../actions";
import type { StockRow } from "../types";

export function AdjustForm({ rows, canMutate = true }: { rows: StockRow[]; canMutate?: boolean }) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);

  async function onSubmit(formData: FormData) {
    if (!canMutate) return;
    setPending(true);
    const skuId = String(formData.get("sku_id") ?? "");
    const sku = rows.find((row) => row.skuId === skuId);
    const quantity = Number(formData.get("quantity") ?? 0);
    const reason = String(formData.get("reason") ?? "").trim();
    try {
      await adjustStock(formData);
      const direction = quantity > 0 ? "tăng" : "giảm";
      setAlert({
        tone: "success",
        title: "Điều chỉnh kho thành công",
        reason: `Đã ${direction} ${Math.abs(quantity)} chiếc ${sku?.name ?? ""}.`,
        detail: `Lý do: ${reason}. Loại biến động: ${ledgerTypeLabel(quantity > 0 ? "STOCK_ADJUSTMENT_IN" : "STOCK_ADJUSTMENT_OUT")}. Tồn trước (hiển thị): ${sku?.quantity ?? 0} → sau: ${(sku?.quantity ?? 0) + quantity}.`,
      });
    } catch (error) {
      setAlert({
        tone: "error",
        title: "Điều chỉnh kho thất bại",
        reason: error instanceof Error ? error.message : "Không ghi được điều chỉnh.",
        detail: "Tồn kho không đổi. Không có bản ghi biến động.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h1 className="text-[15px] font-semibold">Điều chỉnh kho</h1>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        Không được sửa số tồn trực tiếp. Nhập số dương để tăng, số âm để giảm. Phải ghi rõ lý do.
      </p>
      {!canMutate ? (
        <p className="mt-4 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[12px] text-[var(--tlkv-muted)]">
          Tài khoản chỉ xem — không được ghi điều chỉnh kho.
        </p>
      ) : null}
      <form action={onSubmit} className="mt-4 grid max-w-xl grid-cols-1 gap-3">
        <label className="text-sm">
          Mã hàng
          <select
            name="sku_id"
            required
            disabled={!canMutate}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 disabled:opacity-60"
          >            {rows.map((row) => (
              <option key={row.skuId} value={row.skuId}>
                {row.sku} · {row.name} · tồn {row.quantity}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Số lượng (+/-)
          <input
            name="quantity"
            type="number"
            required
            defaultValue={-1}
            disabled={!canMutate}
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 disabled:opacity-60"
          />
        </label>
        <label className="text-sm">
          Lý do
          <input
            name="reason"
            required
            disabled={!canMutate}
            placeholder="Kiểm kê / hàng lỗi / ..."
            className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !canMutate}
          className="h-10 rounded-lg bg-[var(--tlkv-amber)] px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Đang ghi..." : "Ghi điều chỉnh"}
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
