"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle,
  FilePdf,
  Fire,
  Printer,
  Scales,
  XCircle,
} from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { formatChi } from "../labels";
import type { BuyDetail, MeltWeightItemPayload } from "../types";
import { isBuyInMeltWorkflow, workflowStatusLabel } from "../workflowLabels";
import { BuyWorkflowStepper } from "./BuyWorkflowStepper";

export type BuyWorkflowPanelProps = {
  buy: BuyDetail;
  pending?: boolean;
  onIssueCommitment: () => void;
  onStartMelt: () => void;
  onSetWeights: (items: MeltWeightItemPayload[]) => void;
  onConfirmAgree: () => void;
  onConfirmCancel: () => void;
  onPrintCommitment: () => void;
  onPrintForm02: () => void;
  onPrintInvoice: () => void;
};

/**
 * Compact right-side melt workflow chrome: stepper, summary, timeline, next actions.
 */
export function BuyWorkflowPanel({
  buy,
  pending = false,
  onIssueCommitment,
  onStartMelt,
  onSetWeights,
  onConfirmAgree,
  onConfirmCancel,
  onPrintCommitment,
  onPrintForm02,
  onPrintInvoice,
}: BuyWorkflowPanelProps) {
  const wf = String(buy.workflowStatus || "INTAKE");
  const inFlow = isBuyInMeltWorkflow(buy);
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of buy.items) {
      next[item.id] =
        item.weightAfterChi != null && item.weightAfterChi > 0
          ? String(item.weightAfterChi)
          : "";
    }
    setDraftWeights(next);
  }, [buy.id, buy.items]);

  function submitWeights() {
    const items: MeltWeightItemPayload[] = [];
    for (const item of buy.items) {
      const raw = draftWeights[item.id]?.trim() ?? "";
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) return;
      items.push({ item_id: item.id, weight_after_chi: n });
    }
    if (items.length !== buy.items.length) return;
    onSetWeights(items);
  }

  const weightsReady =
    buy.items.length > 0 &&
    buy.items.every((item) => {
      const n = Number((draftWeights[item.id] ?? "").replace(",", "."));
      return Number.isFinite(n) && n > 0;
    });

  return (
    <aside className="rounded-[12px] border border-[var(--tlkv-line)] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold">{buy.buyNo}</p>
          <p className="text-[11px] text-[var(--tlkv-muted)]">
            {workflowStatusLabel(wf)}
            {buy.meltCommitmentNo ? ` · CK ${buy.meltCommitmentNo}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tlkv-amber)]">
          {buy.status === "PROCESSING" ? "Đang xử lý" : String(buy.status)}
        </span>
      </div>

      <div className="mt-3 border-t border-[var(--tlkv-line)] pt-3">
        <BuyWorkflowStepper buy={buy} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-lg border border-[var(--tlkv-line)] px-2.5 py-2">
          <dt className="text-[10px] text-[var(--tlkv-muted)]">Khách</dt>
          <dd className="mt-0.5 font-medium">{buy.customerName}</dd>
        </div>
        <div className="rounded-lg border border-[var(--tlkv-line)] px-2.5 py-2">
          <dt className="text-[10px] text-[var(--tlkv-muted)]">Tổng (ước tính)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatDong(buy.totalDong)}</dd>
        </div>
      </dl>

      <ul className="mt-3 space-y-1.5 border-t border-[var(--tlkv-line)] pt-3 text-[11px] text-[var(--tlkv-muted)]">
        <TimelineRow
          done={true}
          label="Tiếp nhận giao dịch"
          meta={buy.buyNo}
        />
        <TimelineRow
          done={Boolean(buy.meltCommitmentNo) || ["MELT_COMMITTED", "MELTING", "WEIGHT_ENTERED", "AWAITING_CONFIRM", "COMPLETED"].includes(wf)}
          label="Phiếu cam kết nấu"
          meta={buy.meltCommitmentNo || "—"}
        />
        <TimelineRow
          done={Boolean(buy.meltingStartedAt) || ["MELTING", "WEIGHT_ENTERED", "AWAITING_CONFIRM", "COMPLETED"].includes(wf)}
          label="Nấu vàng"
          meta={buy.meltingStartedAt ? formatViDateTime(buy.meltingStartedAt) : "—"}
        />
        <TimelineRow
          done={buy.items.some((i) => i.weightAfterChi != null) || ["WEIGHT_ENTERED", "AWAITING_CONFIRM", "COMPLETED"].includes(wf)}
          label="KL sau nấu"
          meta={
            buy.items.some((i) => i.weightAfterChi != null)
              ? buy.items
                  .map((i) => (i.weightAfterChi != null ? formatChi(i.weightAfterChi) : "—"))
                  .join(", ")
              : "—"
          }
        />
        <TimelineRow
          done={Boolean(buy.form02No) || wf === "COMPLETED"}
          label="Phiếu 02 / Hóa đơn"
          meta={buy.form02No || (wf === "COMPLETED" ? buy.buyNo : "—")}
        />
      </ul>

      {wf === "MELTING" ? (
        <div className="mt-3 space-y-2 rounded-[10px] border border-[var(--tlkv-line)] p-2.5">
          <p className="text-[12px] font-semibold">Nhập khối lượng sau nấu</p>
          {buy.items.map((item) => {
            const before = item.weightBeforeChi > 0 ? item.weightBeforeChi : item.weightChi;
            return (
              <label key={item.id} className="block text-[11px]">
                <span className="text-[var(--tlkv-muted)]">
                  {item.productName} · trước {formatChi(before)}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draftWeights[item.id] ?? ""}
                  onChange={(e) =>
                    setDraftWeights((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="KL sau nấu (chỉ)"
                  className="mt-1 h-9 w-full rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] outline-none focus:border-[var(--tlkv-red)]"
                />
              </label>
            );
          })}
        </div>
      ) : null}

      {inFlow || wf === "COMPLETED" ? (
        <div className="mt-3 flex flex-col gap-2">
          {wf === "INTAKE" ? (
            <PrimaryBtn pending={pending} onClick={onIssueCommitment} icon={<FilePdf size={14} />}>
              Tạo phiếu cam kết nấu
            </PrimaryBtn>
          ) : null}
          {wf === "MELT_COMMITTED" ? (
            <PrimaryBtn pending={pending} onClick={onStartMelt} icon={<Fire size={14} />}>
              Bắt đầu nấu vàng
            </PrimaryBtn>
          ) : null}
          {wf === "MELTING" ? (
            <PrimaryBtn
              pending={pending}
              disabled={!weightsReady}
              onClick={submitWeights}
              icon={<Scales size={14} />}
            >
              Lưu KL sau nấu
            </PrimaryBtn>
          ) : null}
          {wf === "WEIGHT_ENTERED" || wf === "AWAITING_CONFIRM" ? (
            <div className="grid grid-cols-2 gap-2">
              <PrimaryBtn
                pending={pending}
                onClick={onConfirmAgree}
                icon={<CheckCircle size={14} />}
              >
                Đồng ý
              </PrimaryBtn>
              <button
                type="button"
                disabled={pending}
                onClick={onConfirmCancel}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--tlkv-red)]/40 bg-[var(--tlkv-red-soft)] px-3 text-[12px] font-semibold text-[var(--tlkv-red)] disabled:opacity-40"
              >
                <XCircle size={14} />
                Không đồng ý
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5 pt-1">
            <GhostPrint
              label="In cam kết"
              disabled={!buy.meltCommitmentNo && wf === "INTAKE"}
              onClick={onPrintCommitment}
            />
            <GhostPrint
              label="In phiếu 02"
              disabled={!buy.form02No && wf !== "COMPLETED"}
              onClick={onPrintForm02}
            />
            <GhostPrint
              label="In hóa đơn mua"
              disabled={wf !== "COMPLETED" && buy.status !== "COMPLETED"}
              onClick={onPrintInvoice}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function TimelineRow({
  done,
  label,
  meta,
}: {
  done: boolean;
  label: string;
  meta: string;
}) {
  return (
    <li className="flex items-start justify-between gap-2">
      <span className={done ? "font-medium text-[var(--tlkv-text)]" : ""}>{label}</span>
      <span className="shrink-0 tabular-nums">{meta}</span>
    </li>
  );
}

function PrimaryBtn({
  children,
  onClick,
  pending,
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={onClick}
      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
    >
      {icon}
      {pending ? "Đang xử lý..." : children}
    </button>
  );
}

function GhostPrint({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tlkv-line)] bg-white px-2.5 text-[11px] font-medium hover:bg-[var(--tlkv-bg)] disabled:opacity-40"
    >
      <Printer size={12} />
      {label}
    </button>
  );
}
