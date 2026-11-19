import { PrintBrandIdentityHeader } from "@/shared/brand/PrintBrandIdentityHeader";
import { formatDong, formatDongInWords } from "@/shared/lib/money";
import type { CashTransferRow } from "./types";

function formatWhen(iso: string | null): string {
  if (!iso) return "………………";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

/** Chứng từ chuyển tiền A4 — in trình duyệt. */
export function CtctTransferDocument({ transfer }: { transfer: CashTransferRow }) {
  const statusLabel =
    transfer.status === "CONFIRMED"
      ? "Đã xác nhận"
      : transfer.status === "CANCELLED"
        ? "Đã hủy"
        : "Chờ xác nhận";

  return (
    <article className="sale-deposit-print bg-white text-black">
      <PrintBrandIdentityHeader />

      <p
        className="text-center font-bold uppercase"
        style={{ marginTop: "6mm", fontSize: "16pt", letterSpacing: "0.04em" }}
      >
        Chứng từ chuyển tiền
      </p>
      <p className="text-center font-bold" style={{ marginTop: "2mm", fontSize: "12pt" }}>
        Số: {transfer.code}
      </p>
      <p className="text-center" style={{ marginTop: "1.5mm", fontSize: "11pt" }}>
        Trạng thái: {statusLabel}
      </p>

      <table className="w-full" style={{ marginTop: "8mm", fontSize: "11pt", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: "2mm 0", width: "38%" }}>Tài khoản gửi</td>
            <td style={{ padding: "2mm 0", fontWeight: 600 }}>
              {transfer.fromAccountCode} · {transfer.fromStaffName || transfer.fromAccountName}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "2mm 0" }}>Tài khoản nhận</td>
            <td style={{ padding: "2mm 0", fontWeight: 600 }}>
              {transfer.toAccountCode} · {transfer.toStaffName || transfer.toAccountName}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "2mm 0" }}>Số tiền</td>
            <td style={{ padding: "2mm 0", fontWeight: 700 }}>{formatDong(transfer.amountDong)}</td>
          </tr>
          <tr>
            <td style={{ padding: "2mm 0" }}>Bằng chữ</td>
            <td style={{ padding: "2mm 0" }}>{formatDongInWords(transfer.amountDong)}</td>
          </tr>
          <tr>
            <td style={{ padding: "2mm 0" }}>Nội dung</td>
            <td style={{ padding: "2mm 0" }}>{transfer.content}</td>
          </tr>
          <tr>
            <td style={{ padding: "2mm 0" }}>Người lập</td>
            <td style={{ padding: "2mm 0" }}>
              {transfer.createdByEmail} · {formatWhen(transfer.createdAt)}
            </td>
          </tr>
          {transfer.status === "CONFIRMED" ? (
            <tr>
              <td style={{ padding: "2mm 0" }}>Người xác nhận</td>
              <td style={{ padding: "2mm 0" }}>
                {transfer.confirmedByEmail} · {formatWhen(transfer.confirmedAt)}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <p style={{ marginTop: "8mm", fontSize: "10.5pt", lineHeight: 1.5 }}>
        Số dư hai tài khoản chỉ thay đổi sau khi bên nhận bấm <strong>Đã xác nhận</strong> trên hệ thống.
        Chứng từ này dùng để ký nhận giấy tờ kèm theo.
      </p>

      <div
        className="grid grid-cols-2 gap-8"
        style={{ marginTop: "14mm", fontSize: "11pt", textAlign: "center" }}
      >
        <div>
          <p className="font-semibold">Người gửi</p>
          <p style={{ marginTop: "1mm", fontSize: "10pt" }}>(Ký, ghi rõ họ tên)</p>
          <div style={{ height: "28mm" }} />
          <p>{transfer.fromStaffName || "……………………"}</p>
        </div>
        <div>
          <p className="font-semibold">Người nhận</p>
          <p style={{ marginTop: "1mm", fontSize: "10pt" }}>(Ký, ghi rõ họ tên)</p>
          <div style={{ height: "28mm" }} />
          <p>{transfer.toStaffName || "……………………"}</p>
        </div>
      </div>
    </article>
  );
}
