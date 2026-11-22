import type { CSSProperties, ReactNode } from "react";
import { PrintBrandIdentityHeader } from "@/shared/brand/PrintBrandIdentityHeader";
import { formatDongInWords } from "@/shared/lib/money";
import type { GoldTransferRow } from "./types";

function viLongDate(iso: string | null): string {
  if (!iso) return "Ngày …… tháng …… năm ……";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Ngày …… tháng …… năm ……";
  return `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
}

function viDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

function formatQtyInWords(qty: number): string {
  const n = Math.trunc(Number(qty));
  if (!Number.isFinite(n) || n < 0) return "………………";
  const base = formatDongInWords(n).replace(/\s*đồng$/i, "").trim();
  return `${base} chiếc`;
}

function DottedField({ label, value }: { label: string; value: string }) {
  const empty = !value.trim();
  return (
    <p style={{ marginTop: "2.2mm", fontSize: "11pt", lineHeight: 1.45 }}>
      <span>{label}:</span>{" "}
      <span
        style={{
          display: "inline",
          borderBottom: empty ? "1px dotted #333" : "none",
          minWidth: empty ? "48mm" : undefined,
          paddingLeft: empty ? "2mm" : 0,
          fontWeight: empty ? 400 : 600,
        }}
      >
        {empty ? "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0" : value}
      </span>
    </p>
  );
}

const th: CSSProperties = {
  border: "1px solid #111",
  padding: "1.6mm 1.2mm",
  fontWeight: 700,
  textAlign: "center",
  verticalAlign: "middle",
};

const td: CSSProperties = {
  border: "1px solid #111",
  padding: "1.8mm 1.2mm",
  verticalAlign: "middle",
};

function SignCol({
  title,
  note,
  name,
}: {
  title: string;
  note?: ReactNode;
  name: string;
}) {
  return (
    <div style={{ textAlign: "center", fontSize: "11pt" }}>
      <p className="font-semibold">{title}</p>
      <p style={{ marginTop: "1mm", fontSize: "10pt" }}>(Ký, họ tên)</p>
      {note ? <p style={{ marginTop: "1mm", fontSize: "10pt" }}>{note}</p> : null}
      <div style={{ height: "22mm" }} />
      <p className="font-semibold">{name || "……………………"}</p>
    </div>
  );
}

/** Chứng từ chuyển vàng A4 — cùng bố cục mẫu CTCT, nội dung vàng. */
export function CtcvTransferDocument({ transfer }: { transfer: GoldTransferRow }) {
  const fromLabel = [transfer.fromAccountCode, transfer.fromAccountName]
    .filter(Boolean)
    .join(" · ");
  const toLabel = [transfer.toAccountCode, transfer.toAccountName].filter(Boolean).join(" · ");
  const fromOwner = transfer.fromStaffName || transfer.fromAccountName || "";
  const toOwner = transfer.toStaffName || transfer.toAccountName || "";
  const skuLabel = [transfer.skuCode, transfer.skuName].filter(Boolean).join(" · ");

  return (
    <article className="sale-deposit-print bg-white text-black">
      <PrintBrandIdentityHeader />

      <p
        className="text-center font-bold uppercase"
        style={{ marginTop: "5mm", fontSize: "15pt", letterSpacing: "0.03em", lineHeight: 1.35 }}
      >
        Chứng từ chuyển vàng giữa các tài khoản quỹ
      </p>
      <p className="text-center font-semibold" style={{ marginTop: "2mm", fontSize: "11pt" }}>
        {viLongDate(transfer.createdAt)}
      </p>

      <div style={{ marginTop: "5mm" }}>
        <DottedField label="Mã chứng từ" value={transfer.code} />
        <DottedField label="Người lập phiếu" value={transfer.createdByEmail} />
        <DottedField label="Tài khoản chuyển" value={fromLabel} />
        <DottedField label="Chủ tài khoản chuyển" value={fromOwner} />
        <DottedField label="Tài khoản nhận" value={toLabel} />
        <DottedField label="Chủ tài khoản nhận" value={toOwner} />
        <DottedField
          label="Thời gian chuyển"
          value={viDateTime(transfer.createdAt)}
        />
        <DottedField label="Lý do chuyển vàng" value={transfer.content} />
        <DottedField label="SKU / loại vàng" value={skuLabel} />
        <DottedField
          label="Ghi chú"
          value="Chuyển hoàn tất ngay trên hệ thống (không chờ xác nhận bên nhận như CTCT)"
        />
      </div>

      <table
        className="w-full"
        style={{ marginTop: "6mm", fontSize: "10.5pt", borderCollapse: "collapse" }}
      >
        <thead>
          <tr>
            <th style={{ ...th, width: "7%" }}>STT</th>
            <th style={{ ...th, width: "24%" }}>Nội dung chuyển vàng</th>
            <th style={{ ...th, width: "18%" }}>Tài khoản chuyển</th>
            <th style={{ ...th, width: "18%" }}>Tài khoản nhận</th>
            <th style={{ ...th, width: "18%" }}>SKU</th>
            <th style={{ ...th, width: "15%" }}>Số lượng</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...td, textAlign: "center" }}>1</td>
            <td style={td}>{transfer.content || "Chuyển vàng giữa hai tài khoản Quỹ"}</td>
            <td style={td}>{fromLabel || transfer.fromAccountCode}</td>
            <td style={td}>{toLabel || transfer.toAccountCode}</td>
            <td style={td}>{skuLabel || transfer.skuCode}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
              {transfer.quantity}
            </td>
          </tr>
          <tr>
            <td colSpan={5} style={{ ...td, textAlign: "right", fontWeight: 700 }}>
              Tổng cộng
            </td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
              {transfer.quantity} chiếc
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: "4mm", fontSize: "11pt" }}>
        <span className="font-semibold">Số lượng bằng chữ:</span>{" "}
        {formatQtyInWords(transfer.quantity)}.
      </p>

      <div className="grid grid-cols-3 gap-4" style={{ marginTop: "12mm" }}>
        <SignCol title="Người lập phiếu" name={transfer.createdByEmail} />
        <SignCol title="Người chuyển vàng" name={fromOwner} />
        <SignCol
          title="Người nhận vàng"
          note={<>Đã nhận đủ số vàng trên</>}
          name={toOwner}
        />
      </div>

      <p className="text-center" style={{ marginTop: "4mm", fontSize: "10.5pt" }}>
        {viLongDate(transfer.createdAt)}
      </p>

      <div style={{ marginTop: "10mm", textAlign: "center" }}>
        <p className="font-bold uppercase" style={{ fontSize: "11pt", color: "#b91c1c" }}>
          THĂNG LONG KIM VIỆT
        </p>
        <p className="font-semibold uppercase" style={{ fontSize: "9.5pt", marginTop: "1mm" }}>
          GIỮ VÀNG - GIỮ PHÚC - GIỮ NIỀM TIN
        </p>
      </div>
    </article>
  );
}
