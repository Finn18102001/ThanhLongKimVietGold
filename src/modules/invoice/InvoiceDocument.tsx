import Image from "next/image";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { BrandLockup } from "@/shared/brand/BrandLockup";
import { formatChi } from "./labels";
import { PAYMENT_LABEL } from "./types";
import type { InvoiceDetail } from "./types";

export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const staffName = invoice.actorEmail.split("@")[0] ?? invoice.actorEmail;
  return (
    <article className="invoice-print mx-auto max-w-[820px] bg-white p-8 text-[13px] text-[var(--tlkv-text)]">
      <div className="flex items-start justify-between gap-6">
        <BrandLockup variant="invoice" />
        <div className="text-right">
          <h1 className="text-[22px] font-bold tracking-wide">HÓA ĐƠN BÁN HÀNG</h1>
          <p className="mt-1 text-[13px]">
            Số HĐ: <span className="font-bold text-[var(--tlkv-red)]">{invoice.invoiceNo}</span>
          </p>
          <BarcodeMark value={invoice.invoiceNo} />
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
            {formatViDateTime(invoice.issuedAt)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 border-y border-[var(--tlkv-line)] py-4 sm:grid-cols-2">
        <div>
          <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thông tin khách hàng</p>
          <p className="mt-1 font-semibold">{invoice.customerName}</p>
          <p>SĐT: {invoice.isWalkIn || invoice.customerPhone === "WALKIN" ? "—" : invoice.customerPhone}</p>
          <p>Địa chỉ: {invoice.customerAddress || "—"}</p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-[var(--tlkv-muted)]">Thông tin giao dịch</p>
          <p className="mt-1">Nhân viên bán hàng: {staffName}</p>
          <p>Hình thức thanh toán: {PAYMENT_LABEL[invoice.paymentMethod] ?? invoice.paymentMethod}</p>
          <p>Ghi chú: {invoice.note || "—"}</p>
          <p>Mã bán: {invoice.saleNo}</p>
        </div>
      </div>

      <table className="mt-4 w-full text-left">
        <thead>
          <tr className="bg-[var(--tlkv-red-soft)] text-[11px] font-semibold tracking-wide">
            <th className="px-2 py-2">STT</th>
            <th className="px-2 py-2">Sản phẩm</th>
            <th className="px-2 py-2">Mã SP</th>
            <th className="px-2 py-2">ĐVT</th>
            <th className="px-2 py-2 text-right">KL</th>
            <th className="px-2 py-2 text-right">SL</th>
            <th className="px-2 py-2 text-right">Đơn giá</th>
            <th className="px-2 py-2 text-right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, index) => (
            <tr key={`${line.skuId}-${index}`} className="border-b border-[var(--tlkv-line)]">
              <td className="px-2 py-2">{index + 1}</td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <span className="relative h-9 w-9 overflow-hidden rounded bg-[#f8f1e7]">
                    {line.imageUrl ? (
                      <Image src={line.imageUrl} alt="" fill unoptimized sizes="36px" className="object-cover" />
                    ) : null}
                  </span>
                  {line.name}
                </div>
              </td>
              <td className="px-2 py-2">{line.sku}</td>
              <td className="px-2 py-2">Chiếc</td>
              <td className="px-2 py-2 text-right">{formatChi(line.weightChi)}</td>
              <td className="px-2 py-2 text-right">{line.quantity}</td>
              <td className="px-2 py-2 text-right">{formatDong(line.unitPriceDong)}</td>
              <td className="px-2 py-2 text-right font-medium">{formatDong(line.totalPriceDong)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-xs text-[13px]">
          <div className="flex justify-between py-0.5">
            <span>Tạm tính</span>
            <span>{formatDong(invoice.totalDong)}</span>
          </div>
          <div className="flex justify-between py-0.5 text-[var(--tlkv-muted)]">
            <span>Chiết khấu</span>
            <span>0 đ</span>
          </div>
          <div className="flex justify-between py-0.5 text-[var(--tlkv-muted)]">
            <span>Thuế VAT (0%)</span>
            <span>0 đ</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-[var(--tlkv-line)] pt-2">
            <span className="font-semibold">Tổng thanh toán</span>
            <span className="text-[18px] font-bold text-[var(--tlkv-red)]">
              {formatDong(invoice.totalDong)}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
            Bằng chữ: {formatDongInWords(invoice.totalDong)}
          </p>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-8 text-center text-[12px]">
        <div>
          <p className="font-semibold">Khách hàng</p>
          <p className="mt-10">{invoice.customerName}</p>
        </div>
        <div>
          <p className="font-semibold">Người bán hàng</p>
          <p className="mt-10">{staffName}</p>
        </div>
      </div>
      <p className="mt-8 text-center text-[13px] italic">Cảm ơn quý khách và hẹn gặp lại!</p>
      <p className="mt-2 text-[11px] text-[var(--tlkv-muted)]">
        Lưu ý: Giá trên hóa đơn này là giá tại thời điểm bán. Không tự cập nhật khi bảng giá vàng
        thay đổi.
      </p>
    </article>
  );
}

function BarcodeMark({ value }: { value: string }) {
  const bars = Array.from(value).flatMap((char, index) => {
    const code = char.charCodeAt(0);
    return [2 + (code % 3), 1, 1 + ((code + index) % 2)];
  });
  return (
    <svg className="mt-2 ml-auto h-10 w-40" viewBox={`0 0 ${bars.length * 3} 40`} aria-hidden>
      {bars.map((width, index) => (
        <rect
          key={`${value}-${index}`}
          x={index * 3}
          y={0}
          width={width}
          height={40}
          fill={index % 2 === 0 ? "#1f2937" : "transparent"}
        />
      ))}
    </svg>
  );
}
