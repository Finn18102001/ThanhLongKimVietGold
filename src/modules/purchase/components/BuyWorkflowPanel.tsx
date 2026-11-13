"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle,
  FilePdf,
  Fire,
  Printer,
  Scales,
  UploadSimple,
  XCircle,
} from "@phosphor-icons/react";
import { IMAGE_PRESET_PRODUCT, optimizeImageFile } from "@/shared/lib/image-optimize";
import { formatDong } from "@/shared/lib/money";
import { formatViDateTime } from "@/shared/lib/datetime";
import { formatChi, formatStoneDetail } from "../labels";
import {
  buyItemHasStone,
  type BuyAttachmentDocKind,
  type BuyDetail,
  type BuyDetailItem,
  type BuyStoneItemPayload,
  type MeltWeightItemPayload,
} from "../types";
import {
  buyAttachmentKindLabel,
  canPrintCommitmentFromFlow,
  hasPurityTestAttachment,
  isBuyInMeltWorkflow,
  workflowStatusLabel,
} from "../workflowLabels";
import { BuyWorkflowStepper } from "./BuyWorkflowStepper";

export type BuyWorkflowPanelProps = {
  buy: BuyDetail;
  pending?: boolean;
  uploadPending?: boolean;
  onIssueCommitment: () => void;
  onStartMelt: () => void;
  onSetWeights: (items: MeltWeightItemPayload[]) => void;
  /** Saves stone weight / quantity at the purity-upload step. Resolves false when the save failed. */
  onSetStone: (items: BuyStoneItemPayload[]) => Promise<boolean>;
  onUploadFile: (file: File, docKind: BuyAttachmentDocKind) => void | Promise<void>;
  onConfirmAgree: () => void;
  onConfirmCancel: () => void;
  onConfirmInvoice: () => void;
  onComplete: () => void;
  onPrintCommitment: () => void;
  onPrintForm02: () => void;
  onPrintInvoice: () => void;
};

type StoneDraft = { weight: string; quantity: string };

/** Lines bought before stone quantity / unit price existed: stone money was typed by hand, so only weight is editable. */
function isLegacyStoneItem(item: BuyDetailItem): boolean {
  return item.stoneQuantity === 0 && item.stoneUnitPriceDong === 0 && item.stonePriceDong > 0;
}

function parseStoneDraft(draft: StoneDraft | undefined, item: BuyDetailItem) {
  const weightRaw = (draft?.weight ?? "").trim().replace(",", ".");
  const quantityRaw = (draft?.quantity ?? "").trim();
  const weight = weightRaw === "" ? 0 : Number(weightRaw);
  const quantity = quantityRaw === "" ? 0 : Number(quantityRaw);
  const valid = Number.isFinite(weight) && weight >= 0 && Number.isInteger(quantity) && quantity >= 0;
  return {
    weight,
    quantity,
    valid,
    dirty: valid && (weight !== item.stoneWeightChi || quantity !== item.stoneQuantity),
  };
}

/**
 * Compact right-side melt workflow chrome: stepper, summary, timeline, next actions.
 */
export function BuyWorkflowPanel({
  buy,
  pending = false,
  uploadPending = false,
  onIssueCommitment,
  onStartMelt,
  onSetWeights,
  onSetStone,
  onUploadFile,
  onConfirmAgree,
  onConfirmCancel,
  onConfirmInvoice,
  onComplete,
  onPrintCommitment,
  onPrintForm02,
  onPrintInvoice,
}: BuyWorkflowPanelProps) {
  const wf = String(buy.workflowStatus || "INTAKE");
  const inFlow = isBuyInMeltWorkflow(buy);
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>({});
  const [draftStone, setDraftStone] = useState<Record<string, StoneDraft>>({});
  const [stoneError, setStoneError] = useState<string | null>(null);
  const purityRef = useRef<HTMLInputElement | null>(null);
  const relatedRef = useRef<HTMLInputElement | null>(null);
  const hasPurity = hasPurityTestAttachment(buy.attachments);
  const skipMelt = Boolean(buy.skipMelt);
  const busy = pending || uploadPending;

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of buy.items) {
      next[item.id] =
        item.weightAfterChi != null && item.weightAfterChi > 0
          ? String(item.weightAfterChi)
          : "";
    }
    setDraftWeights(next);
    const nextStone: Record<string, StoneDraft> = {};
    for (const item of buy.items) {
      if (!buyItemHasStone(item)) continue;
      nextStone[item.id] = {
        weight: item.stoneWeightChi > 0 ? String(item.stoneWeightChi) : "",
        quantity: item.stoneQuantity > 0 ? String(item.stoneQuantity) : "",
      };
    }
    setDraftStone(nextStone);
    setStoneError(null);
  }, [buy.id, buy.items]);

  const stoneItems = buy.items.filter(buyItemHasStone);
  const stoneDirty = stoneItems.some((item) => parseStoneDraft(draftStone[item.id], item).dirty);

  /** Saves edited stone weight / quantity. Resolves true when nothing changed or the save succeeded. */
  async function saveStone(): Promise<boolean> {
    const items: BuyStoneItemPayload[] = [];
    for (const item of stoneItems) {
      const parsed = parseStoneDraft(draftStone[item.id], item);
      if (!parsed.valid) {
        setStoneError(`${item.productName}: trọng lượng đá phải là số không âm, số lượng đá phải là số nguyên không âm.`);
        return false;
      }
      items.push({ item_id: item.id, stone_weight_chi: parsed.weight, stone_quantity: parsed.quantity });
    }
    setStoneError(null);
    if (!stoneDirty) return true;
    return onSetStone(items);
  }

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

  async function handlePick(file: File | null, docKind: BuyAttachmentDocKind) {
    if (!file || uploadPending) return;
    // Stone weight / quantity are saved together with the purity upload (the upload moves the buy to the next step).
    if (docKind === "PURITY_TEST" && !(await saveStone())) return;
    let next = file;
    const mime = (file.type || "").toLowerCase();
    const isPdf = mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf && mime.startsWith("image/")) {
      const optimized = await optimizeImageFile(file, IMAGE_PRESET_PRODUCT);
      next = optimized.file;
    }
    await onUploadFile(next, docKind);
  }

  const pastCommitment = !["INTAKE", "MELT_COMMITTED"].includes(wf);
  const showPurityUpload = wf === "WEIGHT_ENTERED" && !hasPurity && !skipMelt;
  const showConfirm = wf === "AWAITING_CONFIRM";
  const showInvoice = wf === "INVOICE_ISSUED";
  const showForm02 = wf === "FORM02_READY";

  return (
    <aside className="rounded-[12px] border border-[var(--tlkv-line)] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold">{buy.buyNo}</p>
          <p className="text-[11px] text-[var(--tlkv-muted)]">
            {workflowStatusLabel(wf)}
            {buy.meltCommitmentNo ? ` · CK ${buy.meltCommitmentNo}` : ""}
            {buy.form02No ? ` · ${buy.form02No}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-[var(--tlkv-amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tlkv-amber)]">
          {buy.status === "PROCESSING"
            ? "Đang xử lý"
            : buy.status === "COMPLETED"
              ? "Hoàn thành"
              : buy.status === "VOIDED"
                ? "Đã hủy"
                : buy.status === "CANCELLED"
                  ? "Đã hủy"
                  : String(buy.status)}
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
          <dt className="text-[10px] text-[var(--tlkv-muted)]">Tổng</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatDong(buy.totalDong)}</dd>
        </div>
      </dl>

      <ul className="mt-3 space-y-1.5 border-t border-[var(--tlkv-line)] pt-3 text-[11px] text-[var(--tlkv-muted)]">
        <TimelineRow done={true} label="Tiếp nhận" meta={buy.buyNo} />
        <TimelineRow
          done={
            skipMelt ||
            Boolean(buy.meltCommitmentNo) ||
            pastCommitment ||
            wf === "COMPLETED"
          }
          label="Cam kết nấu"
          meta={
            buy.meltCommitmentNo
              ? buy.meltCommitmentNo
              : skipMelt
                ? "Bỏ qua"
                : "—"
          }
        />
        <TimelineRow
          done={
            skipMelt ||
            Boolean(buy.meltingStartedAt) ||
            ["MELTING", "WEIGHT_ENTERED", "AWAITING_CONFIRM", "INVOICE_ISSUED", "FORM02_READY", "COMPLETED"].includes(
              wf,
            )
          }
          label="Nấu vàng"
          meta={
            buy.meltingStartedAt
              ? formatViDateTime(buy.meltingStartedAt)
              : skipMelt
                ? "Bỏ qua"
                : "—"
          }
        />
        <TimelineRow
          done={
            skipMelt ||
            buy.items.some((i) => i.weightAfterChi != null) ||
            ["WEIGHT_ENTERED", "AWAITING_CONFIRM", "INVOICE_ISSUED", "FORM02_READY", "COMPLETED"].includes(wf)
          }
          label="KL sau nấu"
          meta={
            skipMelt
              ? buy.items
                  .map((i) =>
                    formatChi(
                      i.weightAfterChi ?? i.weightBeforeChi ?? i.weightChi,
                    ),
                  )
                  .join(", ")
              : buy.items.some((i) => i.weightAfterChi != null)
                ? buy.items
                    .map((i) => (i.weightAfterChi != null ? formatChi(i.weightAfterChi) : "—"))
                    .join(", ")
                : "—"
          }
        />
        <TimelineRow
          done={
            skipMelt ||
            hasPurity ||
            ["AWAITING_CONFIRM", "INVOICE_ISSUED", "FORM02_READY", "COMPLETED"].includes(wf)
          }
          label="Phiếu kiểm tra HL"
          meta={
            hasPurity ? "Đã upload" : skipMelt ? "Không yêu cầu" : "Bắt buộc"
          }
        />
        <TimelineRow
          done={["INVOICE_ISSUED", "FORM02_READY", "COMPLETED"].includes(wf)}
          label="Hóa đơn mua"
          meta={["INVOICE_ISSUED", "FORM02_READY", "COMPLETED"].includes(wf) ? buy.buyNo : "—"}
        />
        <TimelineRow
          done={Boolean(buy.form02No) || wf === "COMPLETED"}
          label="Phiếu 02"
          meta={buy.form02No || "—"}
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

      {showPurityUpload ? (
        <div className="mt-3 space-y-2 rounded-[10px] border border-[var(--tlkv-amber)]/40 bg-[var(--tlkv-amber-soft)]/40 p-2.5">
          <p className="text-[12px] font-semibold">Upload phiếu kiểm tra hàm lượng (bắt buộc)</p>
          <p className="text-[11px] text-[var(--tlkv-muted)]">
            PDF giữ nguyên PDF. Ảnh được chuyển WebP trước khi tải lên.
          </p>
          {stoneItems.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-[var(--tlkv-line)] bg-white p-2">
              <p className="text-[12px] font-semibold">Thông tin đá sau nấu</p>
              <p className="text-[11px] text-[var(--tlkv-muted)]">
                Sửa được trọng lượng và số lượng đá. Đơn giá đá giữ nguyên. Thành tiền đá = đơn giá × số lượng.
                Thay đổi được lưu cùng lúc khi tải phiếu HL.
              </p>
              {stoneItems.map((item) => {
                const legacy = isLegacyStoneItem(item);
                const parsed = parseStoneDraft(draftStone[item.id], item);
                const amount = legacy
                  ? item.stonePriceDong
                  : item.stoneUnitPriceDong * (parsed.valid ? parsed.quantity : item.stoneQuantity);
                return (
                  <div key={item.id} className="text-[11px]">
                    <p className="text-[var(--tlkv-muted)]">
                      {item.productName}
                      {legacy ? " · tiền đá nhập tay" : ` · ${formatDong(item.stoneUnitPriceDong)}/viên`}
                    </p>
                    <div className="mt-1 grid grid-cols-2 gap-1.5">
                      <label className="block">
                        <span className="text-[var(--tlkv-muted)]">Trọng lượng đá (chỉ)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={busy}
                          value={draftStone[item.id]?.weight ?? ""}
                          onChange={(e) =>
                            setDraftStone((prev) => ({
                              ...prev,
                              [item.id]: {
                                quantity: prev[item.id]?.quantity ?? "",
                                weight: e.target.value.replace(",", ".").replace(/[^\d.]/g, ""),
                              },
                            }))
                          }
                          className="mt-0.5 h-8 w-full rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px] outline-none focus:border-[var(--tlkv-red)]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[var(--tlkv-muted)]">Số lượng đá (viên)</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={busy || legacy}
                          value={draftStone[item.id]?.quantity ?? ""}
                          onChange={(e) =>
                            setDraftStone((prev) => ({
                              ...prev,
                              [item.id]: {
                                weight: prev[item.id]?.weight ?? "",
                                quantity: e.target.value.replace(/[^\d]/g, ""),
                              },
                            }))
                          }
                          className="mt-0.5 h-8 w-full rounded-lg border border-[var(--tlkv-line)] px-2 text-[12px] outline-none focus:border-[var(--tlkv-red)] disabled:bg-[var(--tlkv-bg)]"
                        />
                      </label>
                    </div>
                    <p className="mt-1 text-[var(--tlkv-muted)]">
                      Thành tiền đá:{" "}
                      <span className="font-semibold tabular-nums text-[var(--tlkv-text)]">
                        {formatDong(amount)}
                      </span>
                    </p>
                  </div>
                );
              })}
              {stoneError ? (
                <p className="text-[11px] font-medium text-[var(--tlkv-red)]">{stoneError}</p>
              ) : null}
              {stoneDirty ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveStone()}
                  className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[12px] font-medium hover:bg-[var(--tlkv-bg)] disabled:opacity-40"
                >
                  Lưu thông tin đá
                </button>
              ) : null}
            </div>
          ) : null}
          {/* label+input: programmatic .click() on display:none file inputs is unreliable in Safari/Chrome */}
          <input
            id="buy-purity-file"
            ref={purityRef}
            type="file"
            accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/*"
            className="sr-only"
            tabIndex={-1}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void handlePick(f, "PURITY_TEST").finally(() => {
                if (purityRef.current) purityRef.current.value = "";
              });
            }}
          />
          <label
            htmlFor="buy-purity-file"
            aria-disabled={busy || undefined}
            className={`inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[12px] font-semibold text-white ${
              busy ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <UploadSimple size={14} />
            {uploadPending ? "Đang xử lý..." : "Chọn file phiếu HL"}
          </label>
        </div>
      ) : null}

      {showConfirm ? (
        <div className="mt-3 space-y-2 rounded-[10px] border border-[var(--tlkv-line)] p-2.5">
          <p className="text-[12px] font-semibold">Khách hàng xác nhận</p>
          <ul className="space-y-1 text-[11px] text-[var(--tlkv-muted)]">
            <li>KH: {buy.customerName}</li>
            {buy.items.map((item) => (
              <li key={item.id}>
                {item.productName}: trước{" "}
                {formatChi(item.weightBeforeChi > 0 ? item.weightBeforeChi : item.weightChi)} → sau{" "}
                {item.weightAfterChi != null ? formatChi(item.weightAfterChi) : "—"} ·{" "}
                {formatDong(item.unitPriceDong)}/chỉ
                {buyItemHasStone(item)
                  ? ` · Đá ${formatStoneDetail(item)}, tiền đá ${formatDong(item.stonePriceDong * item.quantity)}`
                  : ""}{" "}
                · {formatDong(item.totalPriceDong)}
              </li>
            ))}
            <li>
              Phiếu HL:{" "}
              {(buy.attachments ?? [])
                .filter((a) => a.docKind === "PURITY_TEST")
                .map((a) => a.fileName)
                .join(", ") || "—"}
            </li>
            <li className="font-semibold text-[var(--tlkv-text)]">
              Thành tiền: {formatDong(buy.totalDong)}
            </li>
          </ul>
        </div>
      ) : null}

      {showForm02 ? (
        <div className="mt-3 space-y-2 rounded-[10px] border border-[var(--tlkv-line)] p-2.5">
          <p className="text-[12px] font-semibold">Tài liệu liên quan (không bắt buộc)</p>
          <input
            id="buy-related-file"
            ref={relatedRef}
            type="file"
            accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/*"
            className="sr-only"
            tabIndex={-1}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void handlePick(f, "RELATED").finally(() => {
                if (relatedRef.current) relatedRef.current.value = "";
              });
            }}
          />
          <label
            htmlFor="buy-related-file"
            aria-disabled={busy || undefined}
            className={`inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium ${
              busy ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <UploadSimple size={14} />
            {uploadPending ? "Đang tải..." : "Upload tài liệu"}
          </label>
          {(buy.attachments ?? []).filter((a) => a.docKind === "RELATED").length > 0 ? (
            <ul className="space-y-0.5 text-[11px] text-[var(--tlkv-muted)]">
              {(buy.attachments ?? [])
                .filter((a) => a.docKind === "RELATED")
                .map((a) => (
                  <li key={a.id}>
                    {buyAttachmentKindLabel(a.docKind)} · {a.fileName}
                  </li>
                ))}
            </ul>
          ) : null}
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
          {showConfirm ? (
            <div className="space-y-2">
              {skipMelt ? (
                <p className="rounded-lg bg-[var(--tlkv-bg)] px-2.5 py-2 text-[11px] text-[var(--tlkv-muted)]">
                  Nhánh không nấu — khách xác nhận bán sản phẩm theo thông tin đã nhập. Không yêu cầu
                  phiếu cam kết / phiếu hàm lượng.
                </p>
              ) : null}
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
                disabled={busy}
                onClick={onConfirmCancel}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--tlkv-red)]/40 bg-[var(--tlkv-red-soft)] px-3 text-[12px] font-semibold text-[var(--tlkv-red)] disabled:opacity-40"
              >
                <XCircle size={14} />
                Không đồng ý
              </button>
              </div>
            </div>
          ) : null}
          {showInvoice ? (
            <PrimaryBtn pending={pending} onClick={onConfirmInvoice} icon={<CheckCircle size={14} />}>
              Xác nhận hóa đơn → Phiếu 02
            </PrimaryBtn>
          ) : null}
          {showForm02 ? (
            <PrimaryBtn pending={pending} onClick={onComplete} icon={<CheckCircle size={14} />}>
              Tiếp tục hoàn thành (Phiếu 02 đã tạo)
            </PrimaryBtn>
          ) : null}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {canPrintCommitmentFromFlow(wf, skipMelt) ? (
              <GhostPrint label="In cam kết" onClick={onPrintCommitment} />
            ) : null}
            {showInvoice || wf === "FORM02_READY" || wf === "COMPLETED" ? (
              <GhostPrint label="In hóa đơn mua" onClick={onPrintInvoice} />
            ) : null}
            {showForm02 || wf === "COMPLETED" ? (
              <GhostPrint
                label="In phiếu 02"
                disabled={!buy.form02No}
                onClick={onPrintForm02}
              />
            ) : null}
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
