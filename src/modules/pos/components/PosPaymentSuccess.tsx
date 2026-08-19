"use client";

import { useEffect, useState } from "react";
import { CheckCircle, FileText, SealCheck, Wallet } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";

const PAYMENT_LABEL = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
} as const;

export function PosPaymentSuccess({
  invoiceNo,
  saleNo,
  totalDong,
  paymentMethod,
  onViewInvoice,
  onStay,
}: {
  invoiceNo: string;
  saleNo: string;
  totalDong: number;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  onViewInvoice: () => void;
  onStay: () => void;
}) {
  const [seconds, setSeconds] = useState(2);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    const redirect = window.setTimeout(() => {
      onViewInvoice();
    }, 2000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(redirect);
    };
    // Redirect once on mount with the handlers from first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-lg rounded-[12px] bg-white p-6 shadow-[0_24px_60px_rgb(31_41_55/0.18)]">
        <div className="flex flex-col items-center text-center">
          <CheckCircle size={64} weight="fill" className="text-[var(--tlkv-green)]" />
          <h2 className="mt-3 text-[20px] font-bold">Thanh toán thành công</h2>
          <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
            Hóa đơn đã phát hành. Đơn bán hoàn tất. Kho đã trừ.
          </p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[12px] bg-[var(--tlkv-bg)] p-4 text-[13px]">
          <dt className="text-[var(--tlkv-muted)]">Mã HĐ</dt>
          <dd className="text-right font-semibold text-[var(--tlkv-red)]">{invoiceNo}</dd>
          <dt className="text-[var(--tlkv-muted)]">Mã bán</dt>
          <dd className="text-right font-medium">{saleNo}</dd>
          <dt className="text-[var(--tlkv-muted)]">Hình thức</dt>
          <dd className="text-right">{PAYMENT_LABEL[paymentMethod]}</dd>
          <dt className="text-[var(--tlkv-muted)]">Số tiền</dt>
          <dd className="text-right font-semibold">{formatDong(totalDong)}</dd>
        </dl>

        <div className="mt-4 rounded-lg bg-[var(--tlkv-green-soft)] px-3 py-2.5 text-[13px] text-[var(--tlkv-green)]">
          Hóa đơn đã phát hành. Giá giữ nguyên như lúc chốt đơn.
        </div>

        <ol className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
          <Step icon={Wallet} label="Thanh toán" done />
          <Step icon={SealCheck} label="Xác thực" done />
          <Step icon={FileText} label="Hóa đơn" done />
          <Step icon={CheckCircle} label="Hoàn tất" done />
        </ol>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--tlkv-line)]">
          <div
            className="h-full bg-[var(--tlkv-green)] transition-all"
            style={{ width: seconds <= 0 ? "100%" : seconds === 2 ? "35%" : "80%" }}
          />
        </div>
        <p className="mt-2 text-center text-[12px] text-[var(--tlkv-muted)]">
          Đang chuyển đến hóa đơn trong {seconds} giây...
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onStay}
            className="h-10 flex-1 rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium"
          >
            Ở lại POS
          </button>
          <button
            type="button"
            onClick={onViewInvoice}
            className="h-10 flex-1 rounded-lg bg-[var(--tlkv-red)] text-[13px] font-semibold text-white"
          >
            Xem hóa đơn
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon: Icon,
  label,
  done,
}: {
  icon: typeof Wallet;
  label: string;
  done?: boolean;
}) {
  return (
    <li className={done ? "text-[var(--tlkv-green)]" : "text-[var(--tlkv-muted)]"}>
      <Icon size={18} weight={done ? "fill" : "regular"} className="mx-auto" />
      <p className="mt-1">{label}</p>
    </li>
  );
}
