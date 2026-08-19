"use client";

import { useState } from "react";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { receivePurchase } from "../actions";
import type { StockRow } from "../types";

export function ReceiveForm({ rows }: { rows: StockRow[] }) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    const skuId = String(formData.get("sku_id") ?? "");
    const sku = rows.find((row) => row.skuId === skuId);
    const received = Number(formData.get("received_qty") ?? 0);
    try {
      const result = await receivePurchase(formData);
      setAlert({
        tone: "success",
        title: "Nhập hàng thành công",
        reason: `Đã nhận ${received} chiếc ${sku?.name ?? ""}. Tồn kho đã cộng và ghi vào lịch sử biến động.`,
        detail: `Phiếu ${result.receipt_no}. Tồn trước (hiển thị): ${sku?.quantity ?? 0} → sau: ${(sku?.quantity ?? 0) + received}.`,
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
        Chỉ cộng kho khi xác nhận đã nhận hàng thực tế. Mỗi lần thành công sẽ tạo phiếu nhập và một
        dòng trong lịch sử biến động.
      </p>
      <form action={onSubmit} className="mt-4 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          Mã hàng
          <select name="sku_id" required className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3">
            {rows.map((row) => (
              <option key={row.skuId} value={row.skuId}>
                {row.sku} · {row.name} · tồn {row.quantity}
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
          Nhà cung cấp
          <input name="supplier_name" required className="mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3" />
        </label>
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
