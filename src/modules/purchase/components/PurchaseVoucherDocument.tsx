"use client";

import type { CSSProperties } from "react";
import { BRAND_LOGO_MARK } from "@/shared/brand/assets";
import { formatDongCompact, formatDongInWords } from "@/shared/lib/money";
import { formatChi } from "../labels";
import type { BuyDetail } from "../types";
import { viDateLongLine } from "./printDate";

/**
 * PHIẾU MUA HÀNG KIÊM NHẬP KHO VÀ CHI TIỀN
 * Layout locked to: PHIẾU MUA HÀNG final.pdf
 * Font: Times New Roman ~13pt. Signatures blank for wet ink. Display only.
 */
export function PurchaseVoucherDocument({ buy }: { buy: BuyDetail }) {
  const issuedAt = buy.completedAt;
  const totalWords = formatDongInWords(buy.totalDong);
  const emptyRows = Math.max(0, 1 - buy.items.length);

  return (
    <article
      className="purchase-print purchase-print--voucher mx-auto w-full bg-white text-black"
      style={{
        boxSizing: "border-box",
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: "13pt",
        lineHeight: 1.35,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex shrink-0 items-center justify-center"
          style={{ width: "16mm", height: "16mm", background: "#b91c1c" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BRAND_LOGO_MARK}
            alt=""
            width={52}
            height={52}
            style={{ width: "13mm", height: "13mm", objectFit: "contain" }}
          />
        </div>
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-wide" style={{ fontSize: "14pt", color: "#b91c1c" }}>
            THĂNG LONG KIM VIỆT
          </p>
          <p className="font-semibold uppercase tracking-wide" style={{ fontSize: "11pt", marginTop: 2 }}>
            GIỮ VÀNG - GIỮ PHÚC - GIỮ NIỀM TIN
          </p>
          <p style={{ fontSize: "11pt", marginTop: 2 }}>
            Địa chỉ: 322 Nguyễn Trãi, Phường Đại Mỗ, TP.HN
          </p>
          <p style={{ fontSize: "11pt" }}>Hotline: 099.568.2568</p>
        </div>
      </div>

      <p
        className="text-center font-bold uppercase tracking-wide"
        style={{ marginTop: "4mm", fontSize: "14pt" }}
      >
        PHIẾU MUA HÀNG KIÊM NHẬP KHO VÀ CHI TIỀN
      </p>
      <p className="text-center italic" style={{ marginTop: "2mm", fontSize: "13pt" }}>
        {viDateLongLine(issuedAt)}
      </p>

      <section style={{ marginTop: "4mm" }}>
        <DottedField label="Khách hàng" value={buy.customerName} />
        <DottedField label="CCCD" value={buy.customerCitizenId || ""} />
        <DottedField label="Số điện thoại" value={buy.customerPhone || ""} />
        <DottedField label="Địa chỉ" value={buy.customerAddress || ""} />
        <DottedField label="Số tài khoản" value={buy.customerBankAccount || ""} />
        <DottedField label="Chủ tài khoản" value={buy.customerBankHolder || ""} />
      </section>

      <p style={{ marginTop: "3.5mm", fontSize: "13pt" }}>
        Đồng ý bán cho Công ty TNHH Vàng bạc Thăng Long Kim Việt mặt hàng cụ thể như sau :
      </p>

      <table
        className="border-collapse"
        style={{ marginTop: "3mm", width: "100%", tableLayout: "fixed", fontSize: "12pt" }}
      >
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: "28%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "17%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="border border-black text-center font-bold" style={thStyle}>
              STT
            </th>
            <th className="border border-black text-center font-bold" style={thStyle}>
              Tên hàng hoá, dịch vụ
            </th>
            <th className="border border-black text-center font-bold" style={thStyle}>
              Hàm lượng vàng/bạc
            </th>
            <th className="border border-black text-center font-bold" style={thStyle}>
              ĐVT
            </th>
            <th className="border border-black text-center font-bold" style={thStyle}>
              Trọng Lượng
            </th>
            <th className="border border-black text-center font-bold" style={thStyle}>
              Đơn giá
            </th>
            <th className="border border-black text-center font-bold" style={thStyle}>
              Thành tiền
            </th>
          </tr>
        </thead>
        <tbody>
          {buy.items.map((item, index) => (
            <tr key={item.id}>
              <td className="border border-black text-center" style={tdStyle}>
                {index + 1}
              </td>
              <td className="border border-black" style={{ ...tdStyle, wordBreak: "break-word" }}>
                {item.productName}
              </td>
              <td className="border border-black text-center" style={tdStyle}>
                {item.goldAge || item.goldType || ""}
              </td>
              <td className="border border-black text-center" style={tdStyle}>
                chỉ
              </td>
              <td className="border border-black text-right tabular-nums" style={tdStyle}>
                {formatChi(item.weightChi)}
              </td>
              <td className="border border-black text-right tabular-nums" style={tdStyle}>
                {formatDongCompact(item.unitPriceDong)}
              </td>
              <td className="border border-black text-right tabular-nums" style={tdStyle}>
                {formatDongCompact(item.totalPriceDong)}
              </td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <tr key={`empty-${i}`}>
              {Array.from({ length: 7 }).map((__, j) => (
                <td key={j} className="border border-black" style={{ ...tdStyle, height: "8mm" }}>
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="border border-black font-semibold" colSpan={6} style={tdStyle}>
              Tổng cộng
            </td>
            <td className="border border-black text-right font-semibold tabular-nums" style={tdStyle}>
              {formatDongCompact(buy.totalDong)}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: "4mm", fontSize: "13pt" }}>
        <span>Số tiền bằng chữ:</span>
        <span
          className="capitalize"
          style={{
            display: "inline-block",
            marginLeft: 6,
            minWidth: "70%",
            borderBottom: "1px dotted #000",
            paddingBottom: 2,
          }}
        >
          {totalWords || "\u00a0"}
        </span>
      </p>

      <section className="grid grid-cols-3 text-center" style={{ marginTop: "8mm", gap: "4mm", fontSize: "13pt" }}>
        <div>
          <p className="font-semibold">Người lập phiếu</p>
          <p className="italic" style={{ fontSize: "11pt", marginTop: 2 }}>
            (Ký, họ tên)
          </p>
          {/* Leave blank for wet-ink signature */}
          <p style={{ marginTop: "16mm", minHeight: "5mm" }}>&nbsp;</p>
        </div>
        <div>
          <p className="font-semibold">Thủ quỹ</p>
          <p className="italic" style={{ fontSize: "11pt", marginTop: 2 }}>
            (Ký, họ tên)
          </p>
          <p style={{ marginTop: "12mm", minHeight: "5mm" }}>&nbsp;</p>
        </div>
        <div>
          <p className="font-semibold">Khách hàng</p>
          <p className="italic" style={{ fontSize: "11pt", marginTop: 2 }}>
            (Ký, họ tên)
          </p>
          <p className="italic" style={{ fontSize: "11pt" }}>
            Đã nhận đủ số tiền trên
          </p>
          {/* Leave blank for wet-ink — PDF template does not pre-fill name */}
          <p style={{ marginTop: "12mm", minHeight: "5mm" }}>&nbsp;</p>
        </div>
      </section>

      <p className="text-center italic" style={{ marginTop: "10mm", fontSize: "12pt", lineHeight: 1.45 }}>
        Khách hàng phải chịu trách nhiệm về nguồn gốc,
        <br />
        tính hợp pháp của sản phẩm bán cho Thăng Long Kim Việt
      </p>

      <div className="text-center" style={{ marginTop: "8mm" }}>
        <p className="font-semibold tracking-wide" style={{ fontSize: "13pt" }}>
          THĂNG LONG KIM VIỆT
        </p>
        <p className="font-semibold uppercase tracking-wide" style={{ fontSize: "11pt", marginTop: 4 }}>
          GIỮ VÀNG - GIỮ PHÚC - GIỮ NIỀM TIN
        </p>
      </div>
    </article>
  );
}

const thStyle: CSSProperties = {
  padding: "2.2mm 1.2mm",
  verticalAlign: "middle",
  overflow: "hidden",
  wordBreak: "break-word",
};

const tdStyle: CSSProperties = {
  padding: "2.2mm 1.2mm",
  verticalAlign: "middle",
  overflow: "hidden",
};

function DottedField({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-end gap-1" style={{ marginTop: "1.6mm", fontSize: "13pt" }}>
      <span className="shrink-0">{label}&nbsp;:</span>
      <span
        className="min-w-0 flex-1 font-medium"
        style={{ borderBottom: "1px dotted #000", paddingBottom: 1, paddingLeft: 4 }}
      >
        {value || "\u00a0"}
      </span>
    </p>
  );
}
