import Link from "next/link";
import { ROUTES } from "@/shared/navigation/routes";

export function OutboundPage() {
  return (
    <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <h1 className="text-[15px] font-semibold">Xuất hàng</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed">
        Xuất kho bán hàng chỉ xảy ra khi hóa đơn phát hành thành công và sale hoàn tất
        trong cùng một giao dịch backend. Không trừ kho lúc thêm giỏ, không trừ kho chỉ vì
        thanh toán.
      </p>
      <p className="mt-2 text-[13px] text-[var(--tlkv-muted)]">
        Xuất kho không gắn bán hàng (hỏng, mất) dùng Điều chỉnh kho với số âm và lý do bắt buộc.
      </p>
      <div className="mt-4 flex gap-2">
        <Link
          href={ROUTES.pos}
          className="inline-flex h-10 items-center rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
        >
          Mở POS
        </Link>
        <Link
          href={ROUTES.inventoryAdjust}
          className="inline-flex h-10 items-center rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
        >
          Điều chỉnh kho
        </Link>
      </div>
    </section>
  );
}
