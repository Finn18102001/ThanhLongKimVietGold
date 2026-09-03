"use client";

import { formatDong, formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { formatViClock, formatViDateOnly } from "@/shared/lib/datetime";
import { formatChi, paymentStatusLabel } from "../labels";
import type { BuyDetail } from "../types";

/**
 * PHIẾU MUA HÀNG KIÊM NHẬP KHO VÀ CHI TIỀN
 * Fields follow the ops PDF; values come from buy snapshots (not live customer).
 */
export function PurchaseVoucherDocument({ buy }: { buy: BuyDetail }) {
  const issued = buy.completedAt ? formatViDateOnly(buy.completedAt) : "";
  const issuedClock = buy.completedAt ? formatViClock(buy.completedAt) : "";
  const paidWords = formatDongInWords(buy.paidDong);
  const staff = buy.actorEmail.split("@")[0] || buy.actorEmail;

  return (
    <article className="purchase-print mx-auto w-full max-w-[190mm] bg-white px-6 py-5 text-[#1f1f1f]">
      <header className="border-b-2 border-[var(--tlkv-red)] pb-3 text-center">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--tlkv-red)]">
          CÔNG TY TNHH VÀNG BẠC THĂNG LONG KIM VIỆT
        </p>
        <h1 className="mt-2 text-[16px] font-bold uppercase">
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

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#f8f1e7] text-left">
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 font-semibold">STT</th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 font-semibold">
              Hàng hóa / dịch vụ
            </th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 font-semibold">Thương hiệu</th>
            <th className="border border-[var(--tlkv-line)] px-2 py-1.5 font-semibold">Hàm lượng</th>
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
                {item.brandName || "Không brand"}
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

      <section className="mt-4 grid grid-cols-2 gap-4 text-[12px]">
        <div>
          <p>
            <span className="text-[var(--tlkv-muted)]">Tổng cộng: </span>
            <span className="font-semibold">{formatDong(buy.totalDong)}</span>
          </p>
          <p className="mt-1">
            <span className="text-[var(--tlkv-muted)]">Đã chi: </span>
            <span className="font-semibold">{formatDong(buy.paidDong)}</span>
          </p>
          <p className="mt-1">
            <span className="text-[var(--tlkv-muted)]">Còn phải trả: </span>
            <span className="font-semibold text-[var(--tlkv-red)]">{formatDong(buy.remainingDong)}</span>
          </p>
          <p className="mt-1">
            <span className="text-[var(--tlkv-muted)]">Trạng thái: </span>
            {paymentStatusLabel(buy.paymentStatus)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2">
          <p className="text-[11px] text-[var(--tlkv-muted)]">Số tiền đã chi bằng chữ</p>
          <p className="mt-1 font-semibold capitalize">{paidWords}</p>
        </div>
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--tlkv-muted)]">
        Khách hàng xác nhận đã nhận đủ số tiền ghi trên phiếu (phần đã chi) và cam kết sản phẩm có
        nguồn gốc hợp pháp, chịu trách nhiệm trước pháp luật về hàng hóa bán cho công ty.
      </p>

      <section className="mt-6 grid grid-cols-3 gap-3 text-center text-[12px]">
        <SignBox title="Người lập phiếu" name={staff} />
        <SignBox title="Thủ quỹ" name="" />
        <SignBox title="Khách hàng" name={buy.customerName} />
      </section>
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
      <p className="mt-8 text-[11px] text-[var(--tlkv-muted)]">(Ký, ghi rõ họ tên)</p>
      <p className="mt-1 min-h-[18px] font-medium">{name}</p>
    </div>
  );
}
