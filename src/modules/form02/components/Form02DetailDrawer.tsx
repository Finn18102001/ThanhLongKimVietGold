"use client";

import { useEffect, useState } from "react";
import { Printer, X } from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { Form02Document } from "@/modules/purchase/components/Form02Document";
import { printPurchaseDocument } from "@/modules/purchase/print";
import type { BuyDetail } from "@/modules/purchase/types";
import { getForm02Detail } from "../actions";

/**
 * View + print only. Consumes purchase Form02Document template (no edit/delete).
 */
export function Form02DetailDrawer({
  buyId,
  form02NoHint,
  onClose,
}: {
  buyId: string;
  form02NoHint?: string | null;
  onClose: () => void;
}) {
  const [buy, setBuy] = useState<BuyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getForm02Detail(buyId)
      .then((detail) => {
        if (cancelled) return;
        setBuy(detail);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Không tải được chi tiết Phiếu 02.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyId]);

  function onPrint() {
    if (!buy) return;
    // Ensure print node is mounted, then reuse purchase print pipeline.
    window.setTimeout(() => printPurchaseDocument(), 50);
  }

  const titleNo = buy?.form02No || form02NoHint || "Phiếu 02";

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/35 print:hidden">
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết ${titleNo}`}
          className="flex h-full w-full max-w-3xl flex-col bg-white shadow-[0_24px_60px_rgb(31_41_55/0.18)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-5 py-3.5">
            <div>
              <h2 className="text-[16px] font-semibold">{titleNo}</h2>
              {buy?.buyNo ? (
                <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">Phiếu mua {buy.buyNo}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrint}
                disabled={!buy || loading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                <Printer size={14} weight="bold" />
                In Phiếu 02
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <p className="text-[13px] text-[var(--tlkv-muted)]">Đang tải chi tiết…</p>
            ) : error ? (
              <p className="rounded-lg bg-[var(--tlkv-red-soft)] px-3 py-2 text-[13px] text-[var(--tlkv-red)]">
                {error}
              </p>
            ) : buy ? (
              <div className="space-y-4 text-[13px]">
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Info label="Số Phiếu 02" value={buy.form02No || "—"} />
                  <Info label="Số phiếu mua" value={buy.buyNo || "—"} />
                  <Info
                    label="Ngày mua"
                    value={
                      buy.completedAt || buy.createdAt
                        ? formatViDateTime(buy.completedAt || buy.createdAt || "")
                        : "—"
                    }
                  />
                  <Info label="NV mua" value={buy.actorEmail || "—"} />
                  <Info label="Người bán" value={buy.customerName || "—"} />
                  <Info label="Điện thoại" value={buy.customerPhone || "—"} />
                  <Info label="Căn cước" value={buy.customerCitizenId || "—"} />
                  <Info label="Địa chỉ" value={buy.customerAddress || "—"} />
                  <Info label="Tổng thanh toán" value={formatDong(buy.totalDong)} />
                  <Info label="Trạng thái" value={String(buy.status || "—")} />
                </dl>

                {buy.note ? (
                  <p className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[12px]">
                    <span className="text-[var(--tlkv-muted)]">Ghi chú: </span>
                    {buy.note}
                  </p>
                ) : null}

                <div className="overflow-x-auto rounded-lg border border-[var(--tlkv-line)]">
                  <table className="w-full min-w-[640px] text-left text-[12px]">
                    <thead className="bg-[var(--tlkv-bg)] text-[var(--tlkv-muted)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">STT</th>
                        <th className="px-3 py-2 font-medium">Hàng hóa</th>
                        <th className="px-3 py-2 font-medium text-right">KL (chỉ)</th>
                        <th className="px-3 py-2 font-medium text-right">Đơn giá</th>
                        <th className="px-3 py-2 font-medium text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buy.items.map((item, index) => (
                        <tr key={item.id} className="border-t border-[var(--tlkv-line)]">
                          <td className="px-3 py-2 tabular-nums">{index + 1}</td>
                          <td className="px-3 py-2">{item.productName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {Number(item.weightChi).toLocaleString("vi-VN", {
                              maximumFractionDigits: 4,
                            })}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatDong(item.unitPriceDong)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {formatDong(item.totalPriceDong)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-[12px] text-[var(--tlkv-muted)]">
                  Chỉ xem và in. Không chỉnh sửa / xóa từ Quản lý Phiếu 02.
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {buy ? (
        <div className="hidden print:block">
          <Form02Document buy={buy} />
        </div>
      ) : null}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-2.5 py-2">
      <dt className="text-[10px] text-[var(--tlkv-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{value}</dd>
    </div>
  );
}
