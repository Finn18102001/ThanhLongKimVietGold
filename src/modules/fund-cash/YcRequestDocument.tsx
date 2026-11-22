import { PrintBrandIdentityHeader } from "@/shared/brand/PrintBrandIdentityHeader";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import type { CashRequestRow } from "./types";

function formatWhen(iso: string | null): string {
  if (!iso) return "………………";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

/** Phiếu yêu cầu thu/chi A4 — Phần G P10-01. */
export function YcRequestDocument({ request }: { request: CashRequestRow }) {
  const statusLabel =
    request.status === "CONFIRMED"
      ? "Đã xác nhận"
      : request.status === "REJECTED"
        ? "Từ chối"
        : "Chờ xác nhận";
  const kindLabel = request.kind === "CHI" ? "CHI TIỀN" : "THU TIỀN";
  const created = new Date(request.createdAt);
  const dateLabel = Number.isNaN(created.getTime())
    ? ""
    : created.toLocaleDateString("vi-VN");

  return (
    <article className="sale-deposit-print bg-white text-black">
      <PrintBrandIdentityHeader />

      <p
        className="text-center font-bold uppercase"
        style={{ marginTop: "6mm", fontSize: "16pt", letterSpacing: "0.04em" }}
      >
        Phiếu yêu cầu thu/chi
      </p>
      <p className="text-center" style={{ marginTop: "1.5mm", fontSize: "11pt" }}>
        Ngày lập: {dateLabel}
      </p>

      <table className="w-full" style={{ marginTop: "6mm", fontSize: "11pt", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: "1.5mm 0", width: "36%" }}>Mã yêu cầu</td>
            <td style={{ padding: "1.5mm 0", fontWeight: 700 }}>{request.code}</td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>Loại</td>
            <td style={{ padding: "1.5mm 0", fontWeight: 600 }}>{kindLabel}</td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>Trạng thái</td>
            <td style={{ padding: "1.5mm 0" }}>{statusLabel}</td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>Tài khoản thực hiện (Quỹ tiền)</td>
            <td style={{ padding: "1.5mm 0" }}>
              {request.cashAccountCode || "Chờ nhân viên Quỹ tiền xác nhận"}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>Tài khoản liên quan</td>
            <td style={{ padding: "1.5mm 0" }}>
              {[request.relatedGoldAccountCode, request.relatedStaffName]
                .filter(Boolean)
                .join(" · ") || "—"}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>Khách hàng</td>
            <td style={{ padding: "1.5mm 0" }}>{request.customerName || "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>CCCD</td>
            <td style={{ padding: "1.5mm 0" }}>{request.customerCccd || "—"}</td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>Số phiếu / hóa đơn</td>
            <td style={{ padding: "1.5mm 0", fontWeight: 600 }}>
              {request.sourceCode || request.sourceId}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: "5mm", fontSize: "11pt" }}>
        <span className="font-semibold">Ghi chú yêu cầu:</span> {request.note || request.content}
      </p>

      {request.lines.length > 0 ? (
        <table
          className="w-full"
          style={{
            marginTop: "5mm",
            fontSize: "10pt",
            borderCollapse: "collapse",
            borderTop: "1px solid #000",
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "1.5mm 1mm", borderBottom: "1px solid #000" }}>
                STT
              </th>
              <th style={{ textAlign: "left", padding: "1.5mm 1mm", borderBottom: "1px solid #000" }}>
                Tên hàng
              </th>
              <th style={{ textAlign: "right", padding: "1.5mm 1mm", borderBottom: "1px solid #000" }}>
                KL
              </th>
              <th style={{ textAlign: "right", padding: "1.5mm 1mm", borderBottom: "1px solid #000" }}>
                Đơn giá
              </th>
              <th style={{ textAlign: "right", padding: "1.5mm 1mm", borderBottom: "1px solid #000" }}>
                Thành tiền
              </th>
            </tr>
          </thead>
          <tbody>
            {request.lines.map((line, idx) => (
              <tr key={`${line.name}-${idx}`}>
                <td style={{ padding: "1.5mm 1mm", borderBottom: "1px solid #ddd" }}>{idx + 1}</td>
                <td style={{ padding: "1.5mm 1mm", borderBottom: "1px solid #ddd" }}>{line.name}</td>
                <td style={{ padding: "1.5mm 1mm", borderBottom: "1px solid #ddd", textAlign: "right" }}>
                  {line.weight ?? "—"}
                </td>
                <td style={{ padding: "1.5mm 1mm", borderBottom: "1px solid #ddd", textAlign: "right" }}>
                  {line.unitPriceDong != null ? formatDong(line.unitPriceDong) : "—"}
                </td>
                <td style={{ padding: "1.5mm 1mm", borderBottom: "1px solid #ddd", textAlign: "right" }}>
                  {line.amountDong != null ? formatDong(line.amountDong) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <table className="w-full" style={{ marginTop: "5mm", fontSize: "11pt", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: "1.5mm 0", width: "36%" }}>Tổng đề xuất</td>
            <td style={{ padding: "1.5mm 0", fontWeight: 700 }}>{formatDong(request.amountDong)}</td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>Bằng chữ</td>
            <td style={{ padding: "1.5mm 0" }}>{formatDongInWords(request.amountDong)}</td>
          </tr>
          <tr>
            <td style={{ padding: "1.5mm 0" }}>Hình thức TT</td>
            <td style={{ padding: "1.5mm 0" }}>
              {request.paymentMethod === "TRANSFER"
                ? "Chuyển khoản (ghi quỹ CK)"
                : request.paymentMethod === "CARD"
                  ? "Thẻ (ghi quỹ CK)"
                  : request.paymentMethod === "MIXED"
                    ? "Hỗn hợp"
                    : "Tiền mặt (ghi quỹ TM)"}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: "6mm", fontSize: "10.5pt", lineHeight: 1.5 }}>
        Số dư Quỹ tiền chỉ cập nhật khi trạng thái <strong>Đã xác nhận</strong>. Từ chối không đổi trạng
        thái thanh toán hóa đơn (có thể tạo YC mới).
      </p>

      <div
        className="grid grid-cols-2 gap-8"
        style={{ marginTop: "12mm", fontSize: "11pt", textAlign: "center" }}
      >
        <div>
          <p className="font-semibold">Người yêu cầu</p>
          <p style={{ marginTop: "1mm", fontSize: "10pt" }}>(Quỹ vàng / bán · ký tay)</p>
          <div style={{ height: "24mm" }} />
          {/* Để trống — không điền TK đăng nhập; ký trên giấy */}
          <p>……………………</p>
        </div>
        <div>
          <p className="font-semibold">Nhân viên Quỹ tiền xác nhận</p>
          <p style={{ marginTop: "1mm", fontSize: "10pt" }}>(Ký + thời điểm)</p>
          <div style={{ height: "24mm" }} />
          <p>
            {request.confirmedByEmail
              ? `${request.confirmedByEmail} · ${formatWhen(request.confirmedAt)}`
              : "……………………"}
          </p>
        </div>
      </div>
    </article>
  );
}
