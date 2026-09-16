import { BRAND_LOGO_MARK } from "@/shared/brand/assets";

/**
 * Brand identity block for TLKV print vouchers.
 * Locked to PHIẾU MUA HÀNG KIÊM NHẬP KHO VÀ CHI TIỀN header layout.
 */
export function PrintBrandIdentityHeader() {
  return (
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
  );
}
