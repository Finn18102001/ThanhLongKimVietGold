"use client";

import {
  ChatCircleDots,
  EnvelopeSimple,
  FileXls,
  PencilSimple,
  Phone,
  Trash,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatViDateOnly, formatViDateTime } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import { downloadCsv } from "@/shared/lib/csv";
import { invoiceDetailPath } from "@/shared/navigation/routes";
import { PAYMENT_METHOD_LABEL } from "@/modules/pos/labels";
import { deleteCustomer, listCustomerActivity } from "../actions";
import {
  activityKindLabel,
  customerInitials,
  formatPhoneDisplay,
  GENDER_LABEL,
  GROUP_LABEL,
  groupBadgeClass,
  historyPayLabel,
  maskCitizenId,
  TYPE_LABEL,
} from "../labels";
import { getCustomerDebtSummary } from "@/modules/purchase/actions";
import type { DebtSummary } from "@/modules/purchase/types";
import type { CustomerDetail, CustomerDocument, CustomerHistoryItem } from "../types";
import { CccdDocumentsSection } from "./CccdDocumentsSection";

type DetailTab = "info" | "activity";

export function CustomerDetailPanel({
  detail,
  onClose,
  onEdit,
  onDeleted,
}: {
  detail: CustomerDetail;
  onClose: () => void;
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const { customer, history } = detail;
  const [documents, setDocuments] = useState<CustomerDocument[]>(customer.documents);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [debt, setDebt] = useState<DebtSummary | null>(null);
  const [tab, setTab] = useState<DetailTab>("info");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setDocuments(customer.documents);
    setTab("info");
    setExportError(null);
  }, [customer.documents, customer.id]);

  async function onExportActivity() {
    setExporting(true);
    setExportError(null);
    try {
      const rows = await listCustomerActivity(customer.id);
      downloadCustomerActivityCsv(customer.customerNo, customer.name, rows);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Không xuất được Excel");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (customer.isWalkIn) {
      setDebt(null);
      return;
    }
    let cancelled = false;
    void getCustomerDebtSummary(customer.id)
      .then((summary) => {
        if (!cancelled) setDebt(summary);
      })
      .catch(() => {
        if (!cancelled) setDebt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customer.id, customer.isWalkIn]);

  const canDelete = !customer.isWalkIn && customer.saleCount === 0 && onDeleted;
  const phone = formatPhoneDisplay(customer.phone);
  const avgOrder =
    customer.saleCount > 0 ? Math.round(customer.totalDong / customer.saleCount) : 0;
  const saleRows = history.filter((row) => row.activityKind !== "BUY");
  const buyRows = history.filter((row) => row.activityKind === "BUY");

  return (
    <aside className="flex h-full w-full max-w-[380px] shrink-0 flex-col rounded-[12px] border border-[var(--tlkv-line)] bg-white shadow-[var(--tlkv-shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--tlkv-line)] px-4 py-3">
        <h2 className="text-[15px] font-semibold">Chi tiết khách hàng</h2>
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-xl font-bold text-[var(--tlkv-red)]">
            {customerInitials(customer.name)}
          </div>
          <p className="mt-3 text-[17px] font-semibold">{customer.name}</p>
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">{customer.customerNo}</p>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${groupBadgeClass(customer.customerGroup)}`}
          >
            {GROUP_LABEL[customer.customerGroup]}
          </span>
          <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">{TYPE_LABEL[customer.customerType]}</p>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          {phone ? (
            <a
              href={`tel:${customer.phone}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
              aria-label="Gọi điện"
            >
              <Phone size={16} />
            </a>
          ) : null}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
            aria-label="Nhắn tin"
          >
            <ChatCircleDots size={16} />
          </button>
          {customer.email ? (
            <a
              href={`mailto:${customer.email}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
              aria-label="Gửi email"
            >
              <EnvelopeSimple size={16} />
            </a>
          ) : null}
          {!customer.isWalkIn ? (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tlkv-line)] text-[var(--tlkv-muted)] hover:bg-[var(--tlkv-bg)]"
              aria-label="Chỉnh sửa"
            >
              <PencilSimple size={16} />
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] p-1">
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            Thông tin
          </TabButton>
          <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
            Hoạt động ({history.length})
          </TabButton>
        </div>

        {tab === "info" ? (
          <>
            <section className="mt-5 space-y-2.5 text-[13px]">
              {customer.customerType === "BUSINESS" ? (
                <>
                  <InfoRow label="Doanh nghiệp" value={customer.businessName || "—"} />
                  <InfoRow label="MST" value={customer.taxCode || "—"} />
                  <InfoRow label="Đại diện" value={customer.representativeName || "—"} />
                </>
              ) : (
                <>
                  <InfoRow label="CCCD" value={maskCitizenId(customer.citizenId)} />
                  <InfoRow
                    label="Ngày cấp"
                    value={
                      customer.citizenIdIssueDate
                        ? formatViDateOnly(customer.citizenIdIssueDate)
                        : "—"
                    }
                  />
                  <InfoRow
                    label="Ngày hết hạn CCCD"
                    value={
                      customer.citizenIdExpiryDate
                        ? formatViDateOnly(customer.citizenIdExpiryDate)
                        : "—"
                    }
                  />
                  <InfoRow label="Nơi cấp" value={customer.citizenIdIssuePlace || "—"} />
                  <InfoRow label="Quốc tịch" value={customer.nationality || "—"} />
                </>
              )}
              <InfoRow
                label="Ngày sinh"
                value={customer.dateOfBirth ? formatViDateOnly(customer.dateOfBirth) : "—"}
              />
              <InfoRow
                label="Giới tính"
                value={customer.gender ? GENDER_LABEL[customer.gender] : "—"}
              />
              <InfoRow label="Địa chỉ" value={customer.address || "—"} />
              <InfoRow label="Email" value={customer.email || "—"} />
              <InfoRow label="Nhóm" value={GROUP_LABEL[customer.customerGroup]} />
              <InfoRow label="Ngày tham gia" value={formatViDateOnly(customer.createdAt)} />
              <InfoRow label="Ghi chú" value={customer.note || "—"} />
            </section>

            {!customer.isWalkIn && customer.customerType === "INDIVIDUAL" ? (
              <CccdDocumentsSection
                customerId={customer.id}
                documents={documents}
                onUpdated={setDocuments}
              />
            ) : null}

            <section className="mt-5">
              <h3 className="text-[13px] font-semibold">Tổng quan giao dịch</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MiniStat label="Tổng chi tiêu" value={formatDong(customer.totalDong)} />
                <MiniStat
                  label="Số đơn bán"
                  value={String(debt?.saleCount ?? customer.saleCount)}
                />
                <MiniStat label="TB / đơn" value={formatDong(avgOrder)} />
                <MiniStat label="Số đơn mua vào" value={String(debt?.buyCount ?? buyRows.length)} />
              </div>
            </section>

            {!customer.isWalkIn ? (
              <section className="mt-5">
                <h3 className="text-[13px] font-semibold">Công nợ 2 chiều</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniStat
                    label="Khách còn nợ"
                    value={formatDong(debt?.receivableDong ?? 0)}
                  />
                  <MiniStat
                    label="Cửa hàng còn nợ"
                    value={formatDong(debt?.payableDong ?? 0)}
                  />
                </div>
                <p className="mt-2 text-[11px] text-[var(--tlkv-muted)]">
                  Receivable và payable tách riêng. Không gộp thành một số nợ.
                </p>
              </section>
            ) : null}
          </>
        ) : (
          <section className="mt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-[var(--tlkv-red-soft)] px-2.5 py-1 font-semibold text-[var(--tlkv-red)]">
                Bán {saleRows.length}
              </span>
              <span className="rounded-full bg-[var(--tlkv-blue-soft)] px-2.5 py-1 font-semibold text-[var(--tlkv-blue)]">
                Mua vào {buyRows.length}
              </span>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void onExportActivity()}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] bg-white px-2.5 text-[12px] font-semibold text-[var(--tlkv-ink)] hover:bg-[var(--tlkv-bg)] disabled:opacity-50"
              >
                <FileXls size={14} weight="bold" />
                {exporting ? "Đang xuất..." : "Xuất Excel"}
              </button>
            </div>
            {exportError ? (
              <p className="mb-2 text-[12px] text-[var(--tlkv-red)]">{exportError}</p>
            ) : null}
            <p className="mb-2 text-[11px] text-[var(--tlkv-muted)]">
              Xuất toàn bộ hoạt động mua/bán đã hoàn tất của khách tại cửa hàng (CSV mở bằng Excel).
            </p>
            <ul className="space-y-2">
              {history.length === 0 ? (
                <li className="rounded-lg border border-dashed border-[var(--tlkv-line)] px-3 py-4 text-center text-[12px] text-[var(--tlkv-muted)]">
                  Chưa có hoạt động mua/bán hoàn tất tại cửa hàng.
                </li>
              ) : (
                history.map((row) => <ActivityRow key={row.activityId} row={row} />)
              )}
            </ul>
          </section>
        )}

        {canDelete ? (
          <div className="mt-5 border-t border-[var(--tlkv-line)] pt-4">
            <button
              type="button"
              onClick={async () => {
                try {
                  await deleteCustomer(customer.id);
                  onDeleted?.();
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : "Không xóa được");
                }
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium text-[var(--tlkv-red)] hover:bg-[var(--tlkv-red-soft)]"
            >
              <Trash size={14} />
              Xóa khách hàng
            </button>
            {deleteError ? (
              <p className="mt-2 text-[12px] text-[var(--tlkv-red)]">{deleteError}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ActivityRow({ row }: { row: CustomerHistoryItem }) {
  const isBuy = row.activityKind === "BUY";
  const title = (
    <span className="text-[13px] font-semibold text-[var(--tlkv-ink)]">{row.docNo}</span>
  );

  return (
    <li className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isBuy
                  ? "bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]"
                  : "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
              }`}
            >
              {activityKindLabel(row.activityKind)}
            </span>
            {!isBuy && row.invoiceId ? (
              <Link
                href={invoiceDetailPath(row.docNo)}
                className="text-[13px] font-semibold text-[var(--tlkv-red)] hover:underline"
              >
                {row.docNo}
              </Link>
            ) : (
              title
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--tlkv-muted)]">
            {formatViDateOnly(row.issuedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-semibold">{formatDong(row.totalDong)}</p>
          <span
            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isBuy
                ? "bg-[var(--tlkv-blue-soft)] text-[var(--tlkv-blue)]"
                : "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]"
            }`}
          >
            {historyPayLabel(row)}
          </span>
        </div>
      </div>
    </li>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-md text-[12px] font-semibold transition-colors ${
        active
          ? "bg-white text-[var(--tlkv-ink)] shadow-sm"
          : "text-[var(--tlkv-muted)] hover:text-[var(--tlkv-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-[var(--tlkv-line)] pb-2 last:border-b-0">
      <span className="w-[96px] shrink-0 text-[var(--tlkv-muted)]">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2">
      <p className="text-[11px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-1 text-[13px] font-bold">{value}</p>
    </div>
  );
}

function paymentMethodLabel(method: string): string {
  if (method === "CASH" || method === "TRANSFER" || method === "CARD") {
    return PAYMENT_METHOD_LABEL[method];
  }
  return method || "—";
}

function downloadCustomerActivityCsv(
  customerNo: string,
  customerName: string,
  rows: CustomerHistoryItem[],
) {
  const headers = [
    "Mã KH",
    "Tên khách",
    "Loại",
    "Mã chứng từ",
    "Thời gian",
    "Số tiền (đ)",
    "Đã thanh toán (đ)",
    "Còn lại (đ)",
    "Trạng thái TT",
    "Hình thức TT",
    "Ghi chú trạng thái",
  ];
  const data = rows.map((row) => [
    customerNo,
    customerName,
    activityKindLabel(row.activityKind),
    row.docNo,
    formatViDateTime(row.issuedAt),
    row.totalDong,
    row.paidDong,
    row.remainingDong,
    row.paymentStatus,
    paymentMethodLabel(row.paymentMethod),
    historyPayLabel(row),
  ]);
  const safeNo = customerNo.replace(/[^\w-]+/g, "_");
  downloadCsv(
    `hoat-dong-${safeNo}-${new Date().toISOString().slice(0, 10)}.csv`,
    headers,
    data,
  );
}
