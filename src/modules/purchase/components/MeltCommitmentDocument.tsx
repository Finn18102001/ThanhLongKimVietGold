"use client";

import type { CSSProperties } from "react";
import { BRAND_LOGO_MARK } from "@/shared/brand/assets";
import { formatChi } from "../labels";
import type { BuyDetail } from "../types";
import { viDateParts } from "./printDate";

/**
 * PHIẾU CAM KẾT NẤU BÁN SẢN PHẨM
 * Layout locked to PHIẾU CAM KẾT NẤU SP - MỚI 2026 final.docx
 * Typography = Word baseline +1pt (title/brand +1, body +1–2). Do not enlarge further.
 */
export function MeltCommitmentDocument({ buy }: { buy: BuyDetail }) {
  const issuedAt = buy.meltingStartedAt || buy.completedAt;
  const { day, month, year } = viDateParts(issuedAt);
  const docNo = buy.meltCommitmentNo || buy.buyNo;
  const emptyRows = Math.max(0, 2 - buy.items.length);

  return (
    <article
      className="purchase-print purchase-print--commitment bg-white font-serif text-black"
      style={{ boxSizing: "border-box", fontSize: "10.5pt", lineHeight: 1.28 }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex shrink-0 items-center justify-center"
          style={{ width: "13mm", height: "13mm", background: "#b91c1c" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BRAND_LOGO_MARK}
            alt=""
            width={44}
            height={44}
            style={{ width: "11mm", height: "11mm", objectFit: "contain" }}
          />
        </div>
        <div className="min-w-0">
          <p className="font-bold" style={{ fontSize: "15pt", lineHeight: 1.15 }}>
            THĂNG LONG KIM VIỆT
          </p>
          <p className="font-semibold uppercase" style={{ fontSize: "10pt", marginTop: 1 }}>
            Giữ vàng - Giữ phúc - Giữ niềm tin
          </p>
          <p style={{ fontSize: "10pt", marginTop: 1 }}>
            Địa chỉ: 322 Nguyễn Trãi, Phường Đại Mỗ, TP.HN
          </p>
          <p style={{ fontSize: "10pt" }}>Hotline: 099.568.2568</p>
        </div>
      </div>

      <p
        className="text-center font-bold uppercase"
        style={{ marginTop: "3mm", fontSize: "14pt", letterSpacing: "0.02em" }}
      >
        Phiếu cam kết nấu bán sản phẩm
      </p>

      <div
        className="flex items-baseline justify-between gap-3"
        style={{ marginTop: "1.5mm", fontSize: "10.5pt" }}
      >
        <p>
          Số: <span className="font-semibold">{docNo}</span>
        </p>
        <p>
          Ngày {day || "……"} tháng {month || "……"} năm {year || "……"}
        </p>
      </div>

      <section style={{ marginTop: "2mm", fontSize: "10.5pt" }}>
        <p className="flex flex-wrap items-end gap-x-2" style={{ marginTop: "1.2mm" }}>
          <span className="shrink-0">Họ và Tên KH:</span>
          <span className="min-w-[42%] flex-1" style={dotLine}>
            {buy.customerName || "\u00a0"}
          </span>
          <span className="shrink-0">CCCD:</span>
          <span className="min-w-[28%] flex-1" style={dotLine}>
            {buy.customerCitizenId || "\u00a0"}
          </span>
        </p>
        <p className="flex items-end gap-x-2" style={{ marginTop: "1.2mm" }}>
          <span className="shrink-0">Số điện thoại liên hệ:</span>
          <span className="min-w-0 flex-1" style={dotLine}>
            {buy.customerPhone || "\u00a0"}
          </span>
        </p>
        <p className="flex items-end gap-x-2" style={{ marginTop: "1.2mm" }}>
          <span className="shrink-0">Địa chỉ:</span>
          <span className="min-w-0 flex-1" style={dotLine}>
            {buy.customerAddress || "\u00a0"}
          </span>
        </p>
      </section>

      <p className="font-bold" style={{ marginTop: "2.5mm", fontSize: "10.5pt" }}>
        1. Thông tin sản phẩm
      </p>

      {/* Word table: 7 cols — STT | Tên | SL | Trước | Sau | Mô tả | Niêm phong */}
      <table
        className="border-collapse"
        style={{
          marginTop: "1.2mm",
          width: "100%",
          tableLayout: "fixed",
          fontSize: "10pt",
        }}
      >
        <colgroup>
          <col style={{ width: "6.5%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "32.5%" }} />
        </colgroup>
        <thead>
          <tr className="text-center">
            <th className="border border-black font-semibold" rowSpan={3} style={thStyle}>
              STT
            </th>
            <th className="border border-black font-semibold" rowSpan={3} style={thStyle}>
              Tên sản phẩm
            </th>
            <th className="border border-black font-semibold" rowSpan={3} style={thStyle}>
              Số lượng
            </th>
            <th className="border border-black font-semibold" colSpan={3} style={thStyle}>
              Sản phẩm ban đầu
            </th>
            <th className="border border-black font-semibold" rowSpan={3} style={thStyle}>
              Ký và xác nhận thông tin SAU nấu vàng như: Khối lượng,...
              <br />
              <span className="font-normal">(Nhân viên nấu vàng)</span>
            </th>
          </tr>
          <tr className="text-center">
            <th className="border border-black font-semibold" colSpan={2} style={thStyle}>
              Khối lượng
            </th>
            <th className="border border-black font-semibold" rowSpan={2} style={thStyle}>
              Mô tả sản phẩm
              <br />
              <span className="font-normal">(Tình trạng, kiểu chủng…)</span>
            </th>
          </tr>
          <tr className="text-center">
            <th className="border border-black font-semibold" style={thStyle}>
              Trước nấu
            </th>
            <th className="border border-black font-semibold" style={thStyle}>
              Sau nấu
            </th>
          </tr>
        </thead>
        <tbody>
          {buy.items.map((item, index) => {
            const before = item.weightBeforeChi > 0 ? item.weightBeforeChi : item.weightChi;
            const after = item.weightAfterChi;
            const desc = [item.goldAge, item.goldType, item.brandName].filter(Boolean).join(" - ");
            const sealRows = buy.items.length + emptyRows;
            return (
              <tr key={item.id}>
                <td className="border border-black text-center" style={tdStyle}>
                  {index + 1}
                </td>
                <td className="border border-black text-left" style={tdStyle}>
                  {item.productName}
                </td>
                <td className="border border-black text-center tabular-nums" style={tdStyle}>
                  {item.quantity}
                </td>
                <td className="border border-black text-right tabular-nums" style={tdStyle}>
                  {formatChi(before)}
                </td>
                <td className="border border-black text-right tabular-nums" style={tdStyle}>
                  {after != null ? formatChi(after) : ""}
                </td>
                <td className="border border-black text-left" style={tdStyle}>
                  {desc || ""}
                </td>
                {index === 0 ? (
                  <td
                    className="border border-black text-center align-top"
                    rowSpan={sealRows}
                    style={{ ...tdStyle, paddingTop: "2mm" }}
                  >
                    Niêm phong mẫu, ký tên
                  </td>
                ) : null}
              </tr>
            );
          })}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <tr key={`empty-${i}`}>
              {Array.from({ length: 6 }).map((__, j) => (
                <td
                  key={j}
                  className="border border-black"
                  style={{ ...tdStyle, height: "9mm" }}
                >
                  &nbsp;
                </td>
              ))}
              {buy.items.length === 0 && i === 0 ? (
                <td
                  className="border border-black text-center align-top"
                  rowSpan={emptyRows}
                  style={{ ...tdStyle, paddingTop: "2mm" }}
                >
                  Niêm phong mẫu, ký tên
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <section style={{ marginTop: "2.5mm", fontSize: "11pt", lineHeight: 1.32, textAlign: "justify" }}>
        <p className="font-bold">2. Chính sách giao dịch áp dụng</p>
        <p style={{ marginTop: "1mm" }}>
          Đối với hàng hóa không phải mua của công ty (Không có dấu và Giấy đảm bảo vàng của Thăng
          Long Kim Việt)
        </p>
        <p style={{ marginTop: "1.5mm" }}>
          <span className="font-semibold">
            2.1. Đối với hàng trọng lượng (trang sức vàng tây/vàng ta không gắn đá):
          </span>{" "}
          bắt buộc nấu chảy → thử tuổi → mua theo giá vàng thị trường niêm yết tại cửa hàng vào thời
          điểm giao dịch.
        </p>
        <p style={{ marginTop: "1.5mm" }}>
          <span className="font-semibold">2.2. Đối với Hàng có gắn đá ngọc, kim cương:</span> Khách
          hàng mang sản phẩm bảo hành để bóc tách đá ngọc, kim cương ra khỏi vàng, cụ thể:
        </p>
        <p style={{ marginTop: "1mm", paddingLeft: "3mm" }}>
          + Đối với vàng: Phải nấu chảy, thử tuổi để tiến hành mua theo tuổi vàng và giá vàng thị
          trường tại thời điểm giao dịch (nếu hàm lượng vàng đạt).
        </p>
        <p style={{ marginTop: "1mm", paddingLeft: "3mm" }}>
          + Đối với đá ngọc, kim cương: Phải kiểm định lại chất lượng tại các trung tâm kiểm định
          được cấp phép. Nếu đạt chuẩn thì Công ty mua theo giá thỏa thuận giữa Hai bên tại thời
          điểm giao dịch.
        </p>
        <p className="font-bold" style={{ marginTop: "1.5mm" }}>
          ***Lưu ý: Tất cả các sản phẩm sau khi nấu và thử tuổi:
        </p>
        <p style={{ marginTop: "0.8mm", paddingLeft: "3mm" }}>
          - Sản phẩm có hàm lượng vàng từ 92% trở xuống công ty sẽ mua lại theo như quy chế hiện hành
        </p>
        <p style={{ marginTop: "0.8mm", paddingLeft: "3mm" }}>
          - Sản phẩm có hàm lượng vàng thấp hơn 10% công ty sẽ không mua lại
        </p>
      </section>

      <section style={{ marginTop: "2.5mm", fontSize: "11pt", lineHeight: 1.32, textAlign: "justify" }}>
        <p className="font-bold">3. Cam kết của khách hàng</p>
        <p style={{ marginTop: "1mm" }}>
          Tôi đồng ý nấu hỏng sản phẩm để tiến hành mua bán theo Quy chế và Chính sách giao dịch áp
          dụng hiện hành của Công ty TNHH Vàng Bạc Thăng Long Kim Việt.
        </p>
        <p style={{ marginTop: "1mm" }}>
          Tôi cam kết chịu mọi trách nhiệm liên quan đến sản phẩm ban đầu và sau nấu, không có bất kỳ
          khiếu nại nào với Công ty TNHH Vàng Bạc Thăng Long Kim Việt.
        </p>
      </section>

      <p className="text-center font-semibold" style={{ marginTop: "3.5mm", fontSize: "11pt" }}>
        Xác nhận của Công ty TNHH Vàng Bạc Thăng Long Kim Việt
      </p>
      <section
        className="grid grid-cols-2 text-center"
        style={{ marginTop: "2.5mm", gap: "6mm", fontSize: "10.5pt" }}
      >
        <div>
          <p className="font-semibold">Nhân viên mua hàng</p>
          <p className="italic" style={{ fontSize: "9.5pt", marginTop: 1 }}>
            (Ký tên)
          </p>
          {/* Leave blank for wet-ink signature */}
          <p style={{ marginTop: "14mm", minHeight: "4mm" }}>&nbsp;</p>
        </div>
        <div>
          <p className="font-semibold">Xác nhận khách hàng</p>
          <p className="italic" style={{ fontSize: "9.5pt", marginTop: 1 }}>
            (Ký tên)
          </p>
          {/* Leave blank for wet-ink signature */}
          <p style={{ marginTop: "14mm", minHeight: "4mm" }}>&nbsp;</p>
        </div>
      </section>
    </article>
  );
}

const dotLine: CSSProperties = {
  borderBottom: "1px dotted #000",
  paddingBottom: 1,
  paddingLeft: 2,
  fontWeight: 500,
};

const thStyle: CSSProperties = {
  padding: "1.2mm 0.8mm",
  verticalAlign: "middle",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  hyphens: "auto",
};

const tdStyle: CSSProperties = {
  padding: "1.4mm 0.8mm",
  verticalAlign: "middle",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};
