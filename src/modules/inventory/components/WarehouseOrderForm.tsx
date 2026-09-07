"use client";

import { useMemo, useState } from "react";
import { formatDong } from "@/shared/lib/money";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { receivePurchase } from "../actions";
import type { StockRow } from "../types";

type PayMode = "FULL" | "PARTIAL" | "UNPAID";
type GoodsMode = "NOT_RECEIVED" | "RECEIVED";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

export function WarehouseOrderForm({
  rows,
  suppliers,
}: {
  rows: StockRow[];
  suppliers: Array<{ id: string; name: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [skuId, setSkuId] = useState(rows[0]?.skuId ?? "");
  const [supplierName, setSupplierName] = useState(suppliers[0]?.name ?? "");
  const [qty, setQty] = useState(1);
  const [weightChi, setWeightChi] = useState(rows[0]?.weightChi ?? 0);
  const [unitCostPerChi, setUnitCostPerChi] = useState(0);
  const [goodsStatus, setGoodsStatus] = useState<GoodsMode>("NOT_RECEIVED");
  const [payMode, setPayMode] = useState<PayMode>("UNPAID");
  const [paidDong, setPaidDong] = useState(0);
  const [expectedAt, setExpectedAt] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER" | "CARD">("CASH");

  const selected = rows.find((r) => r.skuId === skuId) ?? null;

  const costPerPiece = useMemo(() => {
    if (unitCostPerChi > 0 && weightChi > 0) {
      return Math.round(unitCostPerChi * weightChi);
    }
    return selected?.lastCostDong ?? 0;
  }, [unitCostPerChi, weightChi, selected]);

  const totalDong = costPerPiece * Math.max(0, qty);
  const totalWeight = weightChi * Math.max(0, qty);
  const effectivePaid =
    payMode === "FULL" ? totalDong : payMode === "PARTIAL" ? Math.min(paidDong, totalDong) : 0;
  const remaining = Math.max(0, totalDong - effectivePaid);

  function onSkuChange(nextId: string) {
    setSkuId(nextId);
    const next = rows.find((r) => r.skuId === nextId);
    if (next) setWeightChi(next.weightChi);
  }

  function resetForm() {
    setIdempotencyKey(crypto.randomUUID());
    setQty(1);
    setPaidDong(0);
    setNote("");
    setPayMode("UNPAID");
    setGoodsStatus("NOT_RECEIVED");
  }

  async function onSubmit() {
    if (pending) return;
    if (!skuId || !supplierName.trim()) {
      setAlert({
        tone: "error",
        title: "Thiếu thông tin",
        reason: "Chọn sản phẩm và nguồn hàng trước khi xác nhận.",
      });
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setAlert({
        tone: "error",
        title: "Số lượng không hợp lệ",
        reason: "Số lượng phải là số nguyên > 0.",
      });
      return;
    }
    if (!Number.isInteger(costPerPiece) || costPerPiece < 0) {
      setAlert({
        tone: "error",
        title: "Đơn giá không hợp lệ",
        reason: "Nhập đơn giá nhập (VND/chỉ) để tính giá vốn nguyên.",
      });
      return;
    }
    if (payMode === "PARTIAL" && (!Number.isInteger(paidDong) || paidDong < 0 || paidDong > totalDong)) {
      setAlert({
        tone: "error",
        title: "Số đã trả không hợp lệ",
        reason: "Số đã trả phải là số nguyên VND trong khoảng 0 đến tổng tiền.",
      });
      return;
    }

    setPending(true);
    try {
      const fd = new FormData();
      fd.set("idempotency_key", idempotencyKey);
      fd.set("sku_id", skuId);
      fd.set("expected_qty", String(qty));
      fd.set("received_qty", String(qty));
      fd.set("cost_price_dong", String(costPerPiece));
      fd.set("supplier_name", supplierName.trim());
      fd.set("reason", "Đặt hàng cho kho");
      fd.set("note", note);
      fd.set("pay_mode", payMode);
      fd.set("paid_dong", String(effectivePaid));
      fd.set("goods_status", goodsStatus);
      fd.set("payment_method", paymentMethod);
      fd.set("expected_receive_at", expectedAt);
      fd.set("weight_chi", String(weightChi));
      fd.set("unit_cost_dong_per_chi", String(unitCostPerChi));

      const result = await receivePurchase(fd);
      resetForm();
      setAlert({
        tone: "success",
        title: "Đã xác nhận đặt hàng",
        reason:
          goodsStatus === "RECEIVED"
            ? "Kho đã tăng theo số nhận. Tiền/công nợ ghi theo số thực trả."
            : "Chưa tăng tồn kho. Tiền chỉ giảm nếu đã thanh toán; phần còn lại theo dõi công nợ/tạm ứng.",
        detail: `Phiếu ${result.receipt_no}. TT: ${result.paymentStatus ?? "-"}. Hàng: ${result.goodsStatus ?? goodsStatus}.`,
      });
    } catch (error) {
      setAlert({
        tone: "error",
        title: "Đặt hàng thất bại",
        reason: error instanceof Error ? error.message : "Không tạo được đơn đặt hàng.",
        detail: "Kho / tiền / công nợ chưa thay đổi.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <h1 className="text-[15px] font-semibold">Đặt hàng cho kho</h1>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
          Tồn kho chỉ tăng khi trạng thái nhận hàng là Đã nhận. Thanh toán và công nợ nguồn hàng
          độc lập với trạng thái hàng.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Nhà cung cấp / Nguồn hàng
            <select
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className={FIELD}
            >
              {suppliers.length === 0 ? <option value="">Nhập nguồn hàng bên dưới</option> : null}
              {suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Hoặc gõ tên nguồn hàng mới"
              className={`${FIELD} mt-2`}
            />
          </label>

          <label className="text-sm sm:col-span-2">
            Sản phẩm
            <select value={skuId} onChange={(e) => onSkuChange(e.target.value)} className={FIELD}>
              {rows.map((row) => (
                <option key={row.skuId} value={row.skuId}>
                  {row.name} · {row.sku}
                  {row.brandName ? ` · ${row.brandName}` : ""} · tồn {row.quantity}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Thương hiệu
            <input readOnly value={selected?.brandName ?? ""} className={`${FIELD} bg-[var(--tlkv-bg)]`} />
          </label>
          <label className="text-sm">
            Mã sản phẩm
            <input readOnly value={selected?.sku ?? ""} className={`${FIELD} bg-[var(--tlkv-bg)]`} />
          </label>

          <label className="text-sm">
            Số lượng (cái)
            <input
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className={FIELD}
            />
          </label>
          <label className="text-sm">
            Trọng lượng / cái (chỉ)
            <input
              type="number"
              min={0}
              step="0.0001"
              value={weightChi}
              onChange={(e) => setWeightChi(Number(e.target.value))}
              className={FIELD}
            />
          </label>

          <label className="text-sm">
            Đơn giá nhập (VND/chỉ)
            <input
              type="number"
              min={0}
              step={1}
              value={unitCostPerChi || ""}
              onChange={(e) => setUnitCostPerChi(Number(e.target.value))}
              className={FIELD}
            />
          </label>
          <label className="text-sm">
            Tổng tiền
            <input readOnly value={formatDong(totalDong)} className={`${FIELD} bg-[var(--tlkv-bg)] font-semibold`} />
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm">Trạng thái nhận hàng</legend>
            <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {(
                [
                  { value: "NOT_RECEIVED" as const, label: "Chưa nhận" },
                  { value: "RECEIVED" as const, label: "Đã nhận" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGoodsStatus(opt.value)}
                  className={`h-9 rounded-lg text-[12px] font-semibold ${
                    goodsStatus === opt.value
                      ? "bg-[var(--tlkv-red)] text-white"
                      : "border border-[var(--tlkv-line)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button type="button" disabled className="h-9 rounded-lg border border-[var(--tlkv-line)] text-[12px] text-[var(--tlkv-muted)]">
                Đã bán
              </button>
              <button type="button" disabled className="h-9 rounded-lg border border-[var(--tlkv-line)] text-[12px] text-[var(--tlkv-muted)]">
                Đã trả hàng
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
              Đã bán / Đã trả hàng cập nhật sau khi phát sinh giao dịch tương ứng.
            </p>
          </fieldset>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm">Thanh toán</legend>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(
                [
                  { value: "FULL" as const, label: "Đủ" },
                  { value: "PARTIAL" as const, label: "Một phần" },
                  { value: "UNPAID" as const, label: "Chưa TT" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPayMode(opt.value)}
                  className={`h-9 rounded-lg text-[12px] font-semibold ${
                    payMode === opt.value
                      ? "bg-[var(--tlkv-red)] text-white"
                      : "border border-[var(--tlkv-line)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {payMode === "PARTIAL" ? (
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              <label className="text-sm">
                Đã trả (VND)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={paidDong || ""}
                  onChange={(e) => setPaidDong(Number(e.target.value))}
                  className={FIELD}
                />
              </label>
              <label className="text-sm">
                Còn phải trả
                <input readOnly value={formatDong(remaining)} className={`${FIELD} bg-[var(--tlkv-bg)]`} />
              </label>
            </div>
          ) : null}

          {(payMode === "FULL" || payMode === "PARTIAL") && effectivePaid > 0 ? (
            <label className="text-sm sm:col-span-2">
              Hình thức thanh toán
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "TRANSFER" | "CARD")}
                className={FIELD}
              >
                <option value="CASH">Tiền mặt</option>
                <option value="TRANSFER">Chuyển khoản</option>
                <option value="CARD">Thẻ</option>
              </select>
            </label>
          ) : null}

          <label className="text-sm sm:col-span-2">
            Ngày dự kiến nhận hàng
            <input
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
              className={FIELD}
            />
          </label>

          <label className="text-sm sm:col-span-2">
            Ghi chú / Lý do
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void onSubmit()}
            className="h-10 rounded-lg bg-[var(--tlkv-green)] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Đang ghi..." : "Xác nhận đặt hàng"}
          </button>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <section className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
          <h2 className="text-[13px] font-semibold">Tóm tắt đơn đặt hàng</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--tlkv-muted)]">Tổng số lượng</dt>
              <dd className="font-medium">{qty} cái</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--tlkv-muted)]">Tổng trọng lượng</dt>
              <dd className="font-medium">{totalWeight} chỉ</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--tlkv-muted)]">Tổng tiền</dt>
              <dd className="font-semibold">{formatDong(totalDong)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--tlkv-muted)]">Đã trả</dt>
              <dd className="font-medium">{formatDong(effectivePaid)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--tlkv-muted)]">Còn phải trả</dt>
              <dd className="font-semibold text-[var(--tlkv-red)]">{formatDong(remaining)}</dd>
            </div>
          </dl>
          <span
            className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              goodsStatus === "RECEIVED"
                ? "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
                : "bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]"
            }`}
          >
            {goodsStatus === "RECEIVED" ? "Đã nhận hàng" : "Chưa nhận hàng"}
          </span>
        </section>

        <section className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
          <h2 className="text-[13px] font-semibold">Biến động dự kiến</h2>
          <ul className="mt-3 space-y-2 text-[12px]">
            <li className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2">
              <p className="font-semibold">Đặt hàng</p>
              <p className="text-[var(--tlkv-muted)]">
                {goodsStatus === "RECEIVED" ? "Kèm nhận hàng → tăng tồn kho" : "Chưa làm tăng tồn kho"}
              </p>
            </li>
            <li className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2">
              <p className="font-semibold">Nhận hàng</p>
              <p className="text-[var(--tlkv-muted)]">Tăng tồn kho khi Đã nhận</p>
            </li>
            <li className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2">
              <p className="font-semibold">Thanh toán</p>
              <p className="text-[var(--tlkv-muted)]">
                {effectivePaid > 0 ? `Giảm tiền ${formatDong(effectivePaid)}` : "Không giảm tiền nếu chưa TT"}
              </p>
            </li>
            <li className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2">
              <p className="font-semibold text-[var(--tlkv-red)]">Công nợ nguồn hàng</p>
              <p className="text-[var(--tlkv-muted)]">
                {goodsStatus === "RECEIVED"
                  ? remaining > 0
                    ? `Phát sinh công nợ ${formatDong(remaining)}`
                    : "Không phát sinh công nợ (đã trả đủ)"
                  : effectivePaid > 0
                    ? `Tạm ứng nguồn hàng ${formatDong(effectivePaid)} (chưa nhận hàng)`
                    : "Chưa phát sinh công nợ (chưa nhận hàng)"}
              </p>
            </li>
          </ul>
        </section>
      </aside>

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
