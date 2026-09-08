"use client";

import { formatDong, formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { formatViClock, formatViDateOnly } from "@/shared/lib/datetime";
import { formatChi } from "../labels";
import type { BuyDetail } from "../types";

/**
 * PHIẾU MUA HÀNG KIÊM NHẬP KHO VÀ CHI TIỀN
 * Columns/fields follow PHIẾU MUA HÀNG final PDF.
 */
export function PurchaseVoucherDocument({ buy }: { buy: BuyDetail }) {
  const issued = buy.completedAt ? formatViDateOnly(buy.completedAt) : "";
  const issuedClock = buy.completedAt ? formatViClock(buy.completedAt) : "";
  const paidWords = formatDongInWords(buy.paidDong);
  const staff = buy.actorEmail.split("@")[0] || buy.actorEmail;

  return (
    <article className="purchase-print mx-auto w-full max-w-[190mm] bg-white px-6 py-5 text-[#1f1f1f]">
      <div className="text-center">
        <p className="text-[13px] font-bold tracking-[0.06em] text-[var(--tlkv-red)]">
          THĂNG LONG KIM VIỆT
        </p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--tlkv-text)]">
          Giữ vàng - Giữ phúc - Giữ niềm tin
        </p>
        <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
          Địa chỉ: 322 Nguyễn Trãi, Phường Đại Mỗ, TP.HN · Hotline: 099.568.2568
        </p>
      </div>
      <header className="mt-3 border-b-2 border-[var(--tlkv-red)] pb-3 text-center">
        <h1 className="text-[16px] font-bold uppercase">
          Phiếu mua hàng kiêm nhập kho và chi tiền
        </h1>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
          Số {buy.buyNo}
          {issued ? ` · Ngày ${issued}` : ""}
          {issuedClock ? ` · ${issuedClock}` : ""}
        </p>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
        <Field label="Khách hàng" value={buy.customerName} />
        <Field label="CCCD" value={buy.customerCitizenId || "-"} />
        <Field label="Số điện thoại" value={buy.customerPhone || "-"} />
        <Field label="Địa chỉ" value={buy.customerAddress || "-"} />
        <Field label="Số tài khoản" value={buy.customerBankAccount || "-"} />
        <Field label="Chủ tài khoản" value={buy.customerBankHolder || "-"} />
      </section>

      <p className="mt-3 text-[12px] italic text-[var(--tlkv-text)]">
        Đồng ý bán cho Công ty TNHH Vàng bạc Thăng Long Kim Việt mặt hàng cụ thể như sau:
      </p>

      <table className="mt-3 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#f8f1e7] text-left">
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 font-semibold">STT</th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 font-semibold">
              Tên hàng hoá, dịch vụ
            </th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 font-semibold">
              Hàm lượng vàng/bạc
            </th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 font-semibold">ĐVT</th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 text-right font-semibold">
              Trọng lượng
            </th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 text-right font-semibold">
              Đơn giá
            </th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 text-right font-semibold">
              Thành tiền
            </th>
          </tr>
        </thead>
        <tbody>
          {buy.items.map((item, index) => (
            <tr key={item.id}>
              <td className="border border-[var(--tlkv-line)] px-2 py-1.5 text-center">{index + 1}</td>
              <td className="border border-[var(--tlkv-line)] px-2 py-1.5">
                {item.productName}
                {item.quantity > 1 ? ` ×${item.quantity}` : ""}
              </td>
              <td className="border border-[var(--tlkv-line)] px-2 py-1.5">
                {item.goldAge || item.goldType || "-"}
              </td>
              <td className="border border-[var(--tlkv-line)] px-2 py-1.5">chỉ</td>
              <td className="border border-[var(--tlkv-line)] px-2 py-1.5 text-right tabular-nums">
                {formatChi(item.weightChi)}
              </td>
              <td className="border border-[var(--tlkv-line)] px-2 py-1.5 text-right tabular-nums">
                {formatDongCompact(item.unitPriceDong)}
              </td>
              <td className="border border-[var(--tlkv-line)] px-2 py-1.5 text-right font-medium tabular-nums">
                {formatDongCompact(item.totalPriceDong)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 text-[12px]">
        <p>
          <span className="text-[var(--tlkv-muted)]">Tổng cộng: </span>
          <span className="font-semibold">{formatDong(buy.totalDong)}</span>
        </p>
        <p className="mt-1">
          <span className="text-[var(--tlkv-muted)]">Số tiền bằng chữ: </span>
          <span className="font-semibold capitalize">{paidWords || formatDongInWords(buy.totalDong)}</span>
        </p>
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--tlkv-muted)]">
        Khách hàng phải chịu trách nhiệm về nguồn gốc, tính hợp pháp của sản phẩm bán cho Thăng Long
        Kim Việt. Khách hàng xác nhận đã nhận đủ số tiền ghi trên phiếu (phần đã chi).
      </p>

      <section className="mt-6 grid grid-cols-3 gap-3 text-center text-[12px]">
        <SignBox title="Người lập phiếu" name={staff} />
        <SignBox title="Thủ quỹ" name="" />
        <SignBox title="Khách hàng" name={buy.customerName} />
      </section>
      <p className="mt-2 text-center text-[11px] text-[var(--tlkv-muted)]">Đã nhận đủ số tiền trên</p>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-[var(--tlkv-muted)]">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function SignBox({ title, name }: { title: string; name: string }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <p className="mt-8 text-[11px] text-[var(--tlkv-muted)]">(Ký, họ tên)</p>
      <p className="mt-1 min-h-[18px] font-medium">{name}</p>
    </div>
  );
}
