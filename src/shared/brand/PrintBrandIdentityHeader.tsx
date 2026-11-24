import { BRAND_LOGO_MARK } from "@/shared/brand/assets";
import { PrintDocumentBarcode } from "@/shared/brand/PrintDocumentBarcode";

/**
 * Brand identity block for TLKV print vouchers.
 * Locked to PHIẾU MUA HÀNG KIÊM NHẬP KHO VÀ CHI TIỀN header layout.
 * Optional documentCode: Code 128 (HD… / BUY-…) on the right — YC thu/chi only.
 */
export function PrintBrandIdentityHeader({
  documentCode,
}: {
  documentCode?: string | null;
} = {}) {
  const code = documentCode?.trim() || "";

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
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

      {code ? (
        <div
          className="shrink-0 text-right"
          style={{ maxWidth: "52mm", paddingTop: "1mm" }}
        >
          <div
            style={{
              display: "inline-block",
              background: "#ffffff",
              padding: "1mm 1.5mm",
            }}
          >
            <PrintDocumentBarcode value={code} heightPx={30} />
            <p
              style={{
                marginTop: "1mm",
                fontSize: "9pt",
                fontWeight: 700,
                letterSpacing: "0.02em",
                fontVariantNumeric: "tabular-nums",
                textAlign: "center",
                lineHeight: 1.2,
              }}
            >
              {code}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
