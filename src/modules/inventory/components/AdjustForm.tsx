"use client";

import { useState } from "react";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { adjustStock } from "../actions";
import type { StockRow } from "../types";

export function AdjustForm({ rows }: { rows: StockRow[] }) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);

  async function onSubmit(formData: FormData) {
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
        detail: `Lý do: ${reason}. Loại sổ: ${quantity > 0 ? "STOCK_ADJUSTMENT_IN" : "STOCK_ADJUSTMENT_OUT"}. Tồn trước (hiển thị): ${sku?.quantity ?? 0} → sau: ${(sku?.quantity ?? 0) + quantity}.`,
      });
    } catch (error) {
      setAlert({
        tone: "error",
        title: "Điều chỉnh kho thất bại",
        reason: error instanceof Error ? error.message : "Không ghi được điều chỉnh.",
        detail: "Tồn kho không đổi. Không có dòng sổ cái.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h1 className="text-[15px] font-semibold">Điều chỉnh kho</h1>
      <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
        Không sửa tồn trực tiếp. Số dương = tăng, số âm = giảm. Bắt buộc có lý do.
      </p>
      <form action={onSubmit} className="mt-4 grid max-w-xl grid-cols-1 gap-3">
        <label className="text-sm">
          SKU
          <select name="sku_id" required className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3">
            {rows.map((row) => (
              <option key={row.skuId} value={row.skuId}>
                {row.sku} · {row.name} · tồn {row.quantity}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Số lượng (+/-)
          <input name="quantity" type="number" required defaultValue={-1} className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3" />
        </label>
        <label className="text-sm">
          Lý do
          <input name="reason" required placeholder="Kiểm kê / hàng lỗi / ..." className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3" />
        </label>
        <button
          type="submit"
          disabled={pending}
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
