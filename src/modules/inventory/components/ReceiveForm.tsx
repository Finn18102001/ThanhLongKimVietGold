"use client";

import { useState } from "react";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { receivePurchase } from "../actions";
import type { BrandOption, CategoryOption, PriceRowOption, StockRow } from "../types";

type LineMode = "catalog" | "order";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

export function ReceiveForm({
  rows,
  brands = [],
  categories = [],
  priceRows = [],
}: {
  rows: StockRow[];
  brands?: BrandOption[];
  categories?: CategoryOption[];
  priceRows?: PriceRowOption[];
}) {
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [payMode, setPayMode] = useState<"FULL" | "PARTIAL" | "UNPAID">("UNPAID");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [lineMode, setLineMode] = useState<LineMode>("catalog");

  const [orderName, setOrderName] = useState("");
  const [orderBrandId, setOrderBrandId] = useState(brands[0]?.id ?? "");
  const [orderCategoryId, setOrderCategoryId] = useState("");
  const [orderPriceRowId, setOrderPriceRowId] = useState("");
  const [orderPriceNote, setOrderPriceNote] = useState("");
  const [orderSkuPrefix, setOrderSkuPrefix] = useState("TLKVTS");
  const [orderVisible, setOrderVisible] = useState(false);
  const [orderWeightChi, setOrderWeightChi] = useState(1);

  function resetOrderDraft() {
    setOrderName("");
    setOrderBrandId(brands[0]?.id ?? "");
    setOrderCategoryId("");
    setOrderPriceRowId("");
    setOrderPriceNote("");
    setOrderSkuPrefix("TLKVTS");
    setOrderVisible(false);
    setOrderWeightChi(1);
  }

  async function onSubmit(formData: FormData) {
    if (pending) return;

    formData.set("pay_mode", payMode);

    if (lineMode === "order") {
      const name = orderName.trim();
      const brandId = orderBrandId;
      const prefix = orderSkuPrefix.trim().toUpperCase();
      if (!name || !brandId) {
        setAlert({
          tone: "error",
          title: "Thiếu thông tin sản phẩm Order",
          reason: "Tên sản phẩm và thương hiệu là bắt buộc.",
        });
        return;
      }
      if (!/^[A-Za-z0-9]{2,12}$/.test(prefix)) {
        setAlert({
          tone: "error",
          title: "Mã đầu không hợp lệ",
          reason: "Mã đầu gồm 2 đến 12 ký tự chữ hoặc số. Số phía sau do hệ thống tự tăng.",
        });
        return;
      }

      const received = Number(formData.get("received_qty") ?? 0);
      const expected = Number(formData.get("expected_qty") ?? received);
      const costPriceDong = Number(formData.get("cost_price_dong") ?? "");
      if (!Number.isInteger(costPriceDong) || costPriceDong < 0) {
        setAlert({
          tone: "error",
          title: "Giá vốn không hợp lệ",
          reason: "Giá vốn phải là số nguyên VND không âm.",
        });
        return;
      }
      if (!Number.isInteger(received) || received <= 0) {
        setAlert({
          tone: "error",
          title: "Số nhận không hợp lệ",
          reason: "Số nhận thực tế phải là số nguyên > 0.",
        });
        return;
      }

      formData.set("goods_status", "RECEIVED");
      formData.set(
        "items",
        JSON.stringify([
          {
            sku_id: null,
            expected_qty: expected,
            received_qty: received,
            cost_price_dong: costPriceDong,
            weight_chi: orderWeightChi,
            order_product: {
              name,
              brand_id: brandId,
              category_id: orderCategoryId || null,
              price_row_id: orderPriceRowId || null,
              price_note: orderPriceNote.trim(),
              sku_prefix: prefix,
              visible: orderVisible,
              weight_chi: orderWeightChi,
            },
          },
        ]),
      );

      setPending(true);
      try {
        const result = await receivePurchase(formData);
        setIdempotencyKey(crypto.randomUUID());
        resetOrderDraft();
        setAlert({
          tone: "success",
          title: "Nhập hàng thành công",
          reason: `Đã tạo sản phẩm Order và nhận ${received} chiếc vào kho. Tồn kho đã cộng, ghi giá vốn và lịch sử biến động.`,
          detail: `Phiếu ${result.receipt_no}${
            result.orderSkus?.length ? ` · mã ${result.orderSkus.join(", ")}` : ""
          }. Thanh toán: ${result.paymentStatus ?? "UNPAID"}.`,
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
      return;
    }

    const skuId = String(formData.get("sku_id") ?? "");
    const sku = rows.find((row) => row.skuId === skuId);
    const received = Number(formData.get("received_qty") ?? 0);
    setPending(true);
    try {
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
        Giá vốn là số nguyên VND / chiếc. Backend tính tổng = giá vốn × số nhận. Nhận hàng tăng kho;
        số đã trả giảm tiền và giảm công nợ nguồn hàng. Hai luồng độc lập.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:max-w-md">
        {(
          [
            { value: "catalog" as const, label: "Sản phẩm có sẵn" },
            { value: "order" as const, label: "Tạo sản phẩm Order" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setLineMode(option.value)}
            className={`h-9 rounded-lg text-[12px] font-semibold active:scale-[0.98] ${
              lineMode === option.value
                ? "bg-[var(--tlkv-red)] text-white"
                : "border border-[var(--tlkv-line)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <form action={onSubmit} className="mt-4 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="idempotency_key" value={idempotencyKey} />

        {lineMode === "catalog" ? (
          <label className="text-sm sm:col-span-2">
            Mã hàng
            <select name="sku_id" required className={FIELD}>
              {rows.map((row) => (
                <option key={row.skuId} value={row.skuId}>
                  {row.sku} · {row.name}
                  {row.brandName ? ` · ${row.brandName}` : ""} · tồn {row.quantity}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="text-sm sm:col-span-2">
              Tên sản phẩm
              <input
                required
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm">
              Thương hiệu
              <select
                required
                value={orderBrandId}
                onChange={(e) => setOrderBrandId(e.target.value)}
                className={FIELD}
              >
                <option value="">Chọn thương hiệu</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Danh mục
              <select
                value={orderCategoryId}
                onChange={(e) => setOrderCategoryId(e.target.value)}
                className={FIELD}
              >
                <option value="">Không chọn</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Dòng bảng giá
              <select
                value={orderPriceRowId}
                onChange={(e) => setOrderPriceRowId(e.target.value)}
                className={FIELD}
              >
                <option value="">Không gắn dòng giá</option>
                {priceRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.brand} · {row.product}
                    {row.purity ? ` · ${row.purity}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Giá / ghi chú
              <input
                value={orderPriceNote}
                onChange={(e) => setOrderPriceNote(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="text-sm">
              Mã đầu
              <input
                value={orderSkuPrefix}
                onChange={(e) =>
                  setOrderSkuPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                }
                maxLength={12}
                className={FIELD}
              />
            </label>
            <label className="text-sm">
              Số tự tăng
              <input readOnly value="000000" className={`${FIELD} bg-[var(--tlkv-bg)]`} />
              <span className="mt-1 block text-[11px] text-[var(--tlkv-muted)]">
                Hệ thống gán khi lưu phiếu. Không sửa số này.
              </span>
            </label>
            <label className="text-sm sm:col-span-2">
              Định lượng (chỉ)
              <input
                type="number"
                min={0}
                step="0.0001"
                value={orderWeightChi}
                onChange={(e) => setOrderWeightChi(Number(e.target.value))}
                className={FIELD}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={orderVisible}
                onChange={(e) => setOrderVisible(e.target.checked)}
              />
              Hiển thị
              <span className="text-[11px] text-[var(--tlkv-muted)]">Mặc định không hiển thị.</span>
            </label>
          </>
        )}

        <label className="text-sm">
          Dự kiến
          <input
            name="expected_qty"
            type="number"
            min={0}
            required
            defaultValue={0}
            className={FIELD}
          />
        </label>
        <label className="text-sm">
          Nhận thực tế
          <input
            name="received_qty"
            type="number"
            min={1}
            required
            defaultValue={1}
            className={FIELD}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Giá vốn / chiếc (VND, số nguyên)
          <input
            name="cost_price_dong"
            type="number"
            min={0}
            step={1}
            required
            className={FIELD}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Nhà cung cấp
          <input name="supplier_name" required className={FIELD} />
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
            <input
              name="paid_dong"
              type="number"
              min={0}
              step={1}
              required
              className={FIELD}
            />
          </label>
        ) : null}
        <label className="text-sm sm:col-span-2">
          Lý do
          <input
            name="reason"
            defaultValue="Nhập hàng"
            className={FIELD}
          />
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
