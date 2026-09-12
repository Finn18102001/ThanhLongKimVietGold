"use client";

import { formatDong, formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { formatChi } from "../labels";
import type { BuyDetail } from "../types";
import { viDateLongLine, viDateParts } from "./printDate";

/**
 * Mẫu số 02/TNDN — BẢNG KÊ THU MUA HÀNG HÓA, DỊCH VỤ (KHÔNG CÓ HÓA ĐƠN)
 * Layout locked to VBTL- Mau-02-TNDN.doc + Thông tư 20/2026/TT-BTC.
 * A4 landscape. Times New Roman. Display-only fill from buy data.
 */
export function Form02Document({ buy }: { buy: BuyDetail }) {
  const issuedAt = buy.completedAt;
  const purchaseDate = viDateParts(issuedAt).slash;
  const docNo = buy.form02No || buy.buyNo;
  const totalWords = formatDongInWords(buy.totalDong);
  const note = buy.paymentMethod === "TRANSFER" ? "Chuyển khoản" : buy.paymentMethod === "CARD" ? "Thẻ" : "Tiền mặt";

  return (
    <article
      className="purchase-print purchase-print--form02 mx-auto w-full bg-white text-black"
      style={{
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: "11pt",
        lineHeight: 1.3,
      }}
    >      <div className="relative">
        <div className="absolute right-0 top-0 w-[42mm] border border-black px-2 py-1.5 text-center text-[10px] leading-tight">
          <p className="font-bold">Mẫu số: 02/TNDN</p>
          <p className="mt-0.5 italic">
            (Ban hành kèm theo Thông tư số 20/2026/TT-BTC
            <br />
            của Bộ trưởng Bộ Tài chính)
          </p>
        </div>

        <div className="pr-[48mm] text-center">
          <h1 className="text-[14px] font-bold uppercase leading-tight">
            Bảng kê thu mua hàng hóa, dịch vụ
            <br />
            không có hóa đơn
          </h1>
          <p className="mt-1 text-[12px] italic">{viDateLongLine(issuedAt)}</p>
          <p className="mt-0.5 text-[11px]">Số: {docNo}</p>
        </div>
      </div>

      <section className="mt-4 space-y-0.5 text-[11px]">
        <p>
          <span>- Tên doanh nghiệp: </span>
          <span className="font-semibold">CÔNG TY TNHH VÀNG BẠC THĂNG LONG KIM VIỆT</span>
        </p>
        <p>
          <span>- Mã số thuế: </span>
          <span className="font-medium">0111388010</span>
        </p>
        <p>
          <span>- Địa chỉ: </span>
          Số 322 Nguyễn Trãi, Phường Đại Mỗ, TP Hà Nội
        </p>
        <p>
          <span>- Số điện thoại: </span>
          099.568.2568
        </p>
        <p>
          <span>- Địa chỉ nơi tổ chức thu mua: </span>
          Số 322 Nguyễn Trãi, Phường Đại Mỗ, TP Hà Nội
        </p>
      </section>

      <table className="mt-3 w-full border-collapse text-[10px]">
        <thead>
          <tr className="text-center">
            <th className="border border-black px-0.5 py-1 font-semibold" rowSpan={2}>
              STT
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold" rowSpan={2}>
              Ngày tháng năm
              <br />
              mua hàng
              <br />
              <span className="font-normal">(1)</span>
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold" colSpan={4}>
              Người bán
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold" colSpan={3}>
              Hàng hóa, dịch vụ mua vào
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold" rowSpan={2}>
              Tổng giá
              <br />
              thanh toán
              <br />
              <span className="font-normal">(9)</span>
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold" rowSpan={2}>
              Ghi chú
              <br />
              <span className="font-normal">(10)</span>
            </th>
          </tr>
          <tr className="text-center">
            <th className="border border-black px-0.5 py-1 font-semibold">
              Tên người bán
              <br />
              <span className="font-normal">(2)</span>
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold">
              Địa chỉ
              <br />
              <span className="font-normal">(3)</span>
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold">
              Số căn cước
              <br />
              <span className="font-normal">(4)</span>
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold">
              Số điện thoại
              <br />
              (nếu có)
              <br />
              <span className="font-normal">(5)</span>
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold">
              Tên hàng hóa, dịch vụ
              <br />
              <span className="font-normal">(6)</span>
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold">
              Số lượng,
              <br />
              trọng lượng
              <br />
              <span className="font-normal">(7)</span>
            </th>
            <th className="border border-black px-0.5 py-1 font-semibold">
              Đơn giá
              <br />
              <span className="font-normal">(8)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {buy.items.map((item, index) => (
            <tr key={item.id}>
              <td className="border border-black px-0.5 py-1.5 text-center">{index + 1}</td>
              <td className="border border-black px-0.5 py-1.5 text-center tabular-nums">
                {purchaseDate}
              </td>
              <td className="border border-black px-0.5 py-1.5">
                {index === 0 ? buy.customerName : ""}
              </td>
              <td className="border border-black px-0.5 py-1.5">
                {index === 0 ? buy.customerAddress || "" : ""}
              </td>
              <td className="border border-black px-0.5 py-1.5 text-center">
                {index === 0 ? buy.customerCitizenId || "" : ""}
              </td>
              <td className="border border-black px-0.5 py-1.5 text-center">
                {index === 0 ? buy.customerPhone || "" : ""}
              </td>
              <td className="border border-black px-0.5 py-1.5">{item.productName}</td>
              <td className="border border-black px-0.5 py-1.5 text-right tabular-nums">
                {formatChi(item.weightChi)}
              </td>
              <td className="border border-black px-0.5 py-1.5 text-right tabular-nums">
                {formatDongCompact(item.unitPriceDong)}
              </td>
              <td className="border border-black px-0.5 py-1.5 text-right tabular-nums">
                {formatDongCompact(item.totalPriceDong)}
              </td>
              <td className="border border-black px-0.5 py-1.5 text-center">
                {index === 0 ? note : ""}
              </td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 2 - buy.items.length) }).map((_, i) => (
            <tr key={`pad-${i}`}>
              {Array.from({ length: 11 }).map((__, j) => (
                <td key={j} className="border border-black px-0.5 py-2">
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[12px]">
        <span className="font-semibold">- Tổng giá trị hàng hóa, dịch vụ mua vào: </span>
        <span className="font-semibold tabular-nums">{formatDong(buy.totalDong)}</span>
      </p>
      <p className="mt-0.5 text-[11px]">
        <span>(Viết bằng chữ: </span>
        <span className="capitalize">{totalWords}</span>
        <span>)</span>
      </p>

      <section className="mt-6 grid grid-cols-2 gap-8 text-center" style={{ fontSize: "11pt" }}>
        <div>
          <p className="font-semibold">Người lập bảng kê</p>
          <p className="mt-1 italic" style={{ fontSize: "10pt" }}>
            (Ký, ghi rõ họ tên)
          </p>
          {/* Leave blank for wet-ink signature */}
          <p className="mt-10 min-h-[18px]">&nbsp;</p>
        </div>
        <div>
          <p className="font-semibold">
            Người đại diện hoặc người được ủy quyền
            <br />
            của doanh nghiệp
          </p>
          <p className="mt-1 italic" style={{ fontSize: "10pt" }}>
            (Ký tên, đóng dấu)
          </p>
          <p className="mt-2 italic" style={{ fontSize: "11pt" }}>
            {viDateLongLine(issuedAt)}
          </p>
          <p className="mt-8 min-h-[18px]">&nbsp;</p>
        </div>
      </section>

      <section className="mt-6 text-[10px] leading-relaxed">
        <p className="font-semibold">Ghi chú:</p>
        <p className="mt-1">
          - Căn cứ vào số thực tế các hàng hóa, dịch vụ mà doanh nghiệp mua của người bán không có
          hóa đơn, lập bảng kê khai theo thứ tự thời gian mua, doanh nghiệp ghi đầy đủ các chỉ tiêu
          trên bảng kê, tổng hợp bảng kê hàng tháng.
        </p>
        <p className="mt-1">
          - Đối với doanh nghiệp có tổ chức các trạm thu mua ở nhiều nơi thì từng trạm thu mua phải
          lập từng bảng kê riêng. Doanh nghiệp lập bảng kê tổng hợp chung của các trạm.
        </p>
      </section>
    </article>
  );
}
