"use client";

import { formatDong, formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { formatViDateOnly } from "@/shared/lib/datetime";
import { formatChi } from "../labels";
import type { BuyDetail } from "../types";

/**
 * Mẫu số 02/TNDN — BẢNG KÊ THU MUA HÀNG HÓA, DỊCH VỤ (KHÔNG CÓ HÓA ĐƠN)
 * Layout aligned to VBTL-Mau-02-TNDN.doc
 */
export function Form02Document({ buy }: { buy: BuyDetail }) {
  const issued = buy.completedAt ? formatViDateOnly(buy.completedAt) : "";
  const docNo = buy.form02No || buy.buyNo;
  const totalWords = formatDongInWords(buy.totalDong);
  const staff = buy.actorEmail.split("@")[0] || buy.actorEmail;

  return (
    <article className="purchase-print mx-auto w-full max-w-[200mm] bg-white px-5 py-4 text-[#1f1f1f]">
      <div className="text-center">
        <p className="text-[11px] font-semibold">Mẫu số: 02/TNDN</p>
        <p className="mt-0.5 text-[10px] text-[var(--tlkv-muted)]">
          (Ban hành kèm theo Thông tư số 20/2026/TT-BTC của Bộ trưởng Bộ Tài chính)
        </p>
        <h1 className="mt-2 text-[14px] font-bold uppercase leading-snug">
          Bảng kê thu mua hàng hóa, dịch vụ
          <br />
          không có hóa đơn
        </h1>
        <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
          Số {docNo}
          {issued ? ` · Ngày ${issued}` : ""}
        </p>
      </div>

      <section className="mt-3 space-y-0.5 text-[11px] leading-relaxed">
        <p>
          <span className="text-[var(--tlkv-muted)]">- Tên doanh nghiệp: </span>
          <span className="font-semibold">CÔNG TY TNHH VÀNG BẠC THĂNG LONG KIM VIỆT</span>
        </p>
        <p>
          <span className="text-[var(--tlkv-muted)]">- Mã số thuế: </span>
          <span className="font-medium">0111388010</span>
        </p>
        <p>
          <span className="text-[var(--tlkv-muted)]">- Địa chỉ: </span>
          Số 322 Nguyễn Trãi, Phường Đại Mỗ, TP Hà Nội
        </p>
        <p>
          <span className="text-[var(--tlkv-muted)]">- Số điện thoại: </span>
          099.568.2568
        </p>
        <p>
          <span className="text-[var(--tlkv-muted)]">- Địa chỉ nơi tổ chức thu mua: </span>
          Số 322 Nguyễn Trãi, Phường Đại Mỗ, TP Hà Nội
        </p>
      </section>

      <table className="mt-3 w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-[#f8f1e7] text-center">
            <th className="border border-[var(--tlkv-line)] px-1 py-1.5 font-semibold" rowSpan={2}>
              STT
            </th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1.5 font-semibold" colSpan={4}>
              Người bán
            </th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1.5 font-semibold" colSpan={3}>
              Hàng hóa, dịch vụ mua vào
            </th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1.5 font-semibold" rowSpan={2}>
              Tổng giá thanh toán
            </th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1.5 font-semibold" rowSpan={2}>
              Ghi chú
            </th>
          </tr>
          <tr className="bg-[#f8f1e7] text-center">
            <th className="border border-[var(--tlkv-line)] px-1 py-1 font-semibold">Tên người bán</th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1 font-semibold">Địa chỉ</th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1 font-semibold">Số căn cước</th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1 font-semibold">Điện thoại</th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1 font-semibold">
              Tên hàng hóa, dịch vụ
            </th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1 font-semibold">
              Số lượng, trọng lượng
            </th>
            <th className="border border-[var(--tlkv-line)] px-1 py-1 font-semibold">Đơn giá</th>
          </tr>
        </thead>
        <tbody>
          {buy.items.map((item, index) => (
            <tr key={item.id}>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5 text-center">{index + 1}</td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5">
                {index === 0 ? buy.customerName : ""}
              </td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5">
                {index === 0 ? buy.customerAddress || "" : ""}
              </td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5">
                {index === 0 ? buy.customerCitizenId || "" : ""}
              </td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5">
                {index === 0 ? buy.customerPhone || "" : ""}
              </td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5">{item.productName}</td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5 text-right tabular-nums">
                {item.quantity} × {formatChi(item.weightChi)}
              </td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5 text-right tabular-nums">
                {formatDongCompact(item.unitPriceDong)}
              </td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5 text-right tabular-nums">
                {formatDongCompact(item.totalPriceDong)}
              </td>
              <td className="border border-[var(--tlkv-line)] px-1 py-1.5" />
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[12px]">
        <span className="font-semibold">- Tổng giá trị hàng hóa, dịch vụ mua vào: </span>
        <span className="font-semibold tabular-nums">{formatDong(buy.totalDong)}</span>
      </p>
      <p className="mt-1 text-[11px]">
        <span className="text-[var(--tlkv-muted)]">(Số tiền bằng chữ: </span>
        <span className="font-medium capitalize">{totalWords}</span>
        <span className="text-[var(--tlkv-muted)]">)</span>
      </p>

      <section className="mt-8 grid grid-cols-2 gap-6 text-center text-[11px]">
        <div>
          <p className="font-semibold">Người lập bảng kê</p>
          <p className="mt-8 text-[10px] text-[var(--tlkv-muted)]">(Ký, ghi rõ họ tên)</p>
          <p className="mt-1 min-h-[18px] font-medium">{staff}</p>
        </div>
        <div>
          <p className="font-semibold">Người đại diện doanh nghiệp</p>
          <p className="mt-8 text-[10px] text-[var(--tlkv-muted)]">(Ký tên, đóng dấu)</p>
          <p className="mt-1 min-h-[18px] font-medium">&nbsp;</p>
        </div>
      </section>
    </article>
  );
}
