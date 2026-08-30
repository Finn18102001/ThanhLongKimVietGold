"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ClockCounterClockwise, Warning } from "@phosphor-icons/react";
import { CustomerSelectModal } from "@/modules/customer/components/CustomerSelectModal";
import { customerInitials, formatPhoneDisplay } from "@/modules/customer/labels";
import type { CustomerRecord } from "@/modules/customer/types";
import { formatViDate, formatViDateTime } from "@/shared/lib/datetime";
import { formatDong } from "@/shared/lib/money";
import { ROUTES } from "@/shared/navigation/routes";
import { Modal } from "@/shared/ui/Modal";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import {
  collectBuyPayment,
  completeBuy,
  getBuy,
  getCustomerDebtSummary,
} from "./actions";
import { CatalogBuyModal } from "./components/CatalogBuyModal";
import { MarketGoldModal } from "./components/MarketGoldModal";
import { PurchaseCatalogPanel } from "./components/PurchaseCatalogPanel";
import { PurchaseInvoicePreview } from "./components/PurchaseInvoicePreview";
import { PurchaseLinesTable } from "./components/PurchaseLinesTable";
import { PurchasePaymentPanel } from "./components/PurchasePaymentPanel";
import {
  defaultDueDateIso,
  parseDongInput,
  purchaseInputClass,
  resolvePaidDong,
} from "./components/purchaseFormUtils";
import {
  formatChi,
  paymentMethodLabel,
  paymentStatusBadgeClass,
  paymentStatusLabel,
} from "./labels";
import {
  lineHasPriceException,
  lineTotalDong,
  toBuyItemPayload,
  type BuyDetail,
  type BuyLine,
  type BuyListRow,
  type BuyPayMode,
  type DebtSummary,
  type MarketGoldRef,
  type PaymentMethod,
  type PurchaseCatalogItem,
} from "./types";

export function PurchaseWorkspace({
  catalog,
  marketRefs,
  recentBuys: initialBuys,
}: {
  catalog: PurchaseCatalogItem[];
  marketRefs: MarketGoldRef[];
  recentBuys: BuyListRow[];
}) {
  const idempotencyKey = useRef<string | null>(null);
  const collectKey = useRef<string | null>(null);
  /** Client-only draft meta — avoid SSR/client UUID/Date hydration mismatch. */
  const [draftMeta, setDraftMeta] = useState<{ id: string; startedAt: string } | null>(null);

  useEffect(() => {
    setDraftMeta({
      id: crypto.randomUUID().slice(0, 8).toUpperCase(),
      startedAt: new Date().toISOString(),
    });
  }, []);

  const [recentBuys, setRecentBuys] = useState(initialBuys);
  const [lines, setLines] = useState<BuyLine[]>([]);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [debt, setDebt] = useState<DebtSummary | null>(null);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [catalogPick, setCatalogPick] = useState<PurchaseCatalogItem | null>(null);
  const [showMarket, setShowMarket] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [approveException, setApproveException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [payMode, setPayMode] = useState<BuyPayMode>("FULL");
  const [paidDong, setPaidDong] = useState(0);
  const [dueDate, setDueDate] = useState(defaultDueDateIso);
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [success, setSuccess] = useState<{
    buyNo: string;
    totalDong: number;
    paidDong: number;
    remainingDong: number;
  } | null>(null);

  const [detail, setDetail] = useState<BuyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("CASH");
  const [collectDue, setCollectDue] = useState(defaultDueDateIso);
  const [collectPending, setCollectPending] = useState(false);

  const totalDong = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotalDong(line), 0),
    [lines],
  );
  const effectivePaid = resolvePaidDong(payMode, paidDong, totalDong);
  const remainingDong = Math.max(0, totalDong - effectivePaid);
  const anyCatalogException = lines.some(lineHasPriceException);

  async function onSelectCustomer(next: CustomerRecord) {
    if (next.isWalkIn) {
      setAlert({
        tone: "error",
        title: "Không dùng khách lẻ",
        reason: "Giao dịch mua vào bắt buộc chọn khách hàng thật, không dùng khách vãng lai.",
      });
      return;
    }
    setCustomer(next);
    setPickingCustomer(false);
    try {
      setDebt(await getCustomerDebtSummary(next.id));
    } catch {
      setDebt(null);
    }
  }

  function onChangeLine(localId: string, patch: Partial<BuyLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.localId !== localId) return line;
        if (line.kind === "catalog") {
          return { ...line, ...patch, kind: "catalog", isMarketGold: false as const };
        }
        return { ...line, ...patch, kind: "market", isMarketGold: true as const };
      }),
    );
  }

  function resetDraft() {
    setLines([]);
    setNote("");
    setPayMode("FULL");
    setPaidDong(0);
    setDueDate(defaultDueDateIso());
    setApproveException(false);
    setExceptionReason("");
    setSuccess(null);
    setDraftMeta({
      id: crypto.randomUUID().slice(0, 8).toUpperCase(),
      startedAt: new Date().toISOString(),
    });
    idempotencyKey.current = null;
  }

  function openReview() {
    if (!customer || customer.isWalkIn) {
      setAlert({
        tone: "error",
        title: "Chưa chọn khách",
        reason: "Phải chọn khách hàng thật trước khi xác nhận mua vào.",
      });
      return;
    }
    if (lines.length === 0) {
      setAlert({
        tone: "error",
        title: "Chưa có hàng",
        reason: "Thêm ít nhất một dòng hàng trước khi chốt.",
      });
      return;
    }
    if (remainingDong > 0 && !dueDate) {
      setAlert({
        tone: "error",
        title: "Thiếu ngày hẹn trả",
        reason: "Khi chưa trả đủ cho khách, phải có ngày hẹn trả.",
      });
      return;
    }
    if (anyCatalogException && approveException && !exceptionReason.trim()) {
      setAlert({
        tone: "error",
        title: "Thiếu lý do ngoại lệ",
        reason: "Khi duyệt ngoại lệ giá ±300.000đ/chỉ, phải nhập lý do.",
      });
      return;
    }
    if (anyCatalogException && !approveException) {
      setAlert({
        tone: "error",
        title: "Cần duyệt ngoại lệ giá",
        reason: "Có dòng catalog vượt ±300.000đ/chỉ. Tick duyệt ngoại lệ hoặc chỉnh giá.",
      });
      return;
    }
    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
    setReviewing(true);
  }

  const openReviewRef = useRef(openReview);
  openReviewRef.current = openReview;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "F9") return;
      event.preventDefault();
      openReviewRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function onConfirmBuy() {
    if (!customer || pending) return;
    setPending(true);
    try {
      const result = await completeBuy({
        customerId: customer.id,
        paymentMethod,
        items: lines.map(toBuyItemPayload),
        note: note.trim() || null,
        paidDong: effectivePaid,
        dueDate: remainingDong > 0 ? dueDate : null,
        approvePriceException: anyCatalogException ? approveException : false,
        priceExceptionReason:
          anyCatalogException && approveException ? exceptionReason.trim() : null,
        idempotencyKey: idempotencyKey.current || crypto.randomUUID(),
      });
      setSuccess({
        buyNo: result.buyNo,
        totalDong: result.totalDong,
        paidDong: result.paidDong,
        remainingDong: result.remainingDong,
      });
      setRecentBuys((prev) => [
        {
          id: result.buyId,
          buyNo: result.buyNo,
          customerId: result.customerId,
          customerName: customer.name,
          customerPhone: customer.phone,
          totalDong: result.totalDong,
          paidDong: result.paidDong,
          remainingDong: result.remainingDong,
          paymentStatus: result.paymentStatus,
          paymentMethod,
          dueDate: result.dueDate,
          actorEmail: "",
          completedAt: new Date().toISOString(),
          note: note.trim() || null,
        },
        ...prev,
      ]);
      setReviewing(false);
      setLines([]);
      setNote("");
      setPayMode("FULL");
      setPaidDong(0);
      setApproveException(false);
      setExceptionReason("");
      idempotencyKey.current = null;
      try {
        setDebt(await getCustomerDebtSummary(customer.id));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setReviewing(false);
      setAlert({
        tone: "error",
        title: "Không hoàn tất mua vào",
        reason: err instanceof Error ? err.message : "Lỗi không xác định.",
      });
      idempotencyKey.current = crypto.randomUUID();
    } finally {
      setPending(false);
    }
  }

  async function openDetail(buyId: string) {
    setDetailLoading(true);
    setDetail(null);
    collectKey.current = null;
    try {
      const buy = await getBuy(buyId);
      setDetail(buy);
      setCollectAmount(buy.remainingDong > 0 ? buy.remainingDong : 0);
      setCollectMethod((buy.paymentMethod as PaymentMethod) || "CASH");
      setCollectDue(buy.dueDate || defaultDueDateIso());
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không tải phiếu mua",
        reason: err instanceof Error ? err.message : "Lỗi không xác định.",
      });
    } finally {
      setDetailLoading(false);
    }
  }

  async function onCollectPayment() {
    if (!detail || collectPending) return;
    if (collectAmount <= 0) {
      setAlert({
        tone: "error",
        title: "Số tiền không hợp lệ",
        reason: "Số tiền trả thêm phải lớn hơn 0.",
      });
      return;
    }
    if (!collectKey.current) {
      collectKey.current = crypto.randomUUID();
    }
    setCollectPending(true);
    try {
      const nextRemaining = Math.max(0, detail.remainingDong - collectAmount);
      const result = await collectBuyPayment({
        buyId: detail.id,
        amountDong: collectAmount,
        paymentMethod: collectMethod,
        idempotencyKey: collectKey.current,
        dueDate: nextRemaining > 0 ? collectDue : null,
      });
      const refreshed = await getBuy(detail.id);
      setDetail(refreshed);
      setRecentBuys((prev) =>
        prev.map((row) =>
          row.id === result.buyId
            ? {
                ...row,
                paidDong: result.paidDong,
                remainingDong: result.remainingDong,
                paymentStatus: result.paymentStatus,
                dueDate: result.dueDate,
              }
            : row,
        ),
      );
      setCollectAmount(result.remainingDong > 0 ? result.remainingDong : 0);
      collectKey.current = null;
      if (customer) {
        try {
          setDebt(await getCustomerDebtSummary(customer.id));
        } catch {
          /* ignore */
        }
      }
      setAlert({
        tone: "success",
        title: "Đã trả thêm cho khách",
        reason: `${result.buyNo}: còn phải trả ${formatDong(result.remainingDong)}.`,
      });
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không thu/trả được",
        reason: err instanceof Error ? err.message : "Lỗi không xác định.",
      });
      collectKey.current = crypto.randomUUID();
    } finally {
      setCollectPending(false);
    }
  }

  return (
    <div className="-mx-6 -my-5 flex min-h-[calc(100dvh-8rem)] flex-col bg-[var(--tlkv-bg)]">
      <div className="flex flex-1 min-h-0 flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold">Mua hàng từ khách</h1>
            <p className="mt-0.5 text-[12px] text-[var(--tlkv-muted)]">
              Nháp {draftMeta?.id ?? "…"} ·{" "}
              {draftMeta ? formatViDateTime(draftMeta.startedAt) : "…"} · Catalog ±300k
              · Vàng TT nhập tay
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRecent(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[12px] font-medium hover:bg-[var(--tlkv-bg)]"
            >
              <ClockCounterClockwise size={14} />
              Phiếu gần đây
            </button>
            <Link
              href={ROUTES.pos}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[12px] font-medium hover:bg-[var(--tlkv-bg)]"
            >
              <ArrowLeft size={14} />
              Quay lại POS bán
            </Link>
          </div>
        </div>

        {success ? (
          <div className="rounded-[12px] border border-[var(--tlkv-green)]/30 bg-[var(--tlkv-green-soft)] px-4 py-3">
            <p className="text-[14px] font-semibold text-[var(--tlkv-green)]">
              Đã tạo phiếu {success.buyNo}
            </p>
            <p className="mt-1 text-[12px] text-[var(--tlkv-text)]">
              Tổng {formatDong(success.totalDong)} · Đã trả {formatDong(success.paidDong)} · Còn phải
              trả {formatDong(success.remainingDong)}
            </p>
            <button
              type="button"
              onClick={resetDraft}
              className="mt-2 text-[12px] font-semibold text-[var(--tlkv-red)]"
            >
              Tạo phiếu mua mới
            </button>
          </div>
        ) : null}

        {anyCatalogException ? (
          <div className="flex items-start gap-2 rounded-[12px] border border-[var(--tlkv-amber)]/40 bg-[var(--tlkv-amber-soft)] px-4 py-3 text-[12px] font-medium text-[var(--tlkv-amber)]">
            <Warning size={16} className="mt-0.5 shrink-0" />
            Có dòng sản phẩm đang bán vượt ngưỡng ±300.000đ/chỉ. Duyệt ngoại lệ ở khung thanh toán
            trước khi chốt.
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tlkv-red-soft)] text-[12px] font-bold text-[var(--tlkv-red)]">
                    {customer ? customerInitials(customer.name) : "?"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">
                      {customer ? customer.name : "Chưa chọn khách hàng"}
                    </p>
                    <p className="text-[12px] text-[var(--tlkv-muted)]">
                      {customer
                        ? formatPhoneDisplay(customer.phone) || customer.customerNo
                        : "Bắt buộc khách thật (không dùng khách lẻ)"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPickingCustomer(true)}
                  className="h-9 shrink-0 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-semibold hover:bg-[var(--tlkv-bg)]"
                >
                  {customer ? "Đổi khách" : "Chọn khách"}
                </button>
              </div>
              {debt && customer ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                  <DebtChip label="Cửa hàng nợ KH" value={formatDong(debt.payableDong)} />
                  <DebtChip label="KH nợ cửa hàng" value={formatDong(debt.receivableDong)} />
                  <DebtChip label="Số lần mua vào" value={String(debt.buyCount)} />
                  <DebtChip label="Số lần bán ra" value={String(debt.saleCount)} />
                </div>
              ) : null}
            </div>

            <PurchaseCatalogPanel
              catalog={catalog}
              onPickCatalog={setCatalogPick}
              onOpenMarket={() => setShowMarket(true)}
            />

            <PurchaseLinesTable
              lines={lines}
              onChangeLine={onChangeLine}
              onRemove={(id) => setLines((prev) => prev.filter((l) => l.localId !== id))}
            />

            <PurchasePaymentPanel
              totalDong={totalDong}
              effectivePaid={effectivePaid}
              remainingDong={remainingDong}
              paymentMethod={paymentMethod}
              onPaymentMethod={setPaymentMethod}
              payMode={payMode}
              onPayMode={setPayMode}
              paidDong={paidDong}
              onPaidDong={setPaidDong}
              dueDate={dueDate}
              onDueDate={setDueDate}
              note={note}
              onNote={setNote}
              anyCatalogException={anyCatalogException}
              approveException={approveException}
              onApproveException={setApproveException}
              exceptionReason={exceptionReason}
              onExceptionReason={setExceptionReason}
            />

            <div className="flex flex-wrap items-center justify-end gap-2 pb-2">
              <button
                type="button"
                onClick={resetDraft}
                className="h-11 rounded-lg border border-[var(--tlkv-line)] bg-white px-4 text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
              >
                Xóa nháp
              </button>
              <button
                type="button"
                disabled={pending || lines.length === 0}
                onClick={openReview}
                className="h-11 rounded-lg bg-[var(--tlkv-red)] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                Xác nhận giao dịch (F9)
              </button>
            </div>
          </div>

          <div className="hidden lg:block">
            <PurchaseInvoicePreview
              customer={customer}
              lines={lines}
              totalDong={totalDong}
              effectivePaid={effectivePaid}
              remainingDong={remainingDong}
              paymentMethod={paymentMethod}
              payMode={payMode}
              dueDate={dueDate}
            />
          </div>
        </div>
      </div>

      {pickingCustomer ? (
        <CustomerSelectModal
          onClose={() => setPickingCustomer(false)}
          onSelect={(c) => void onSelectCustomer(c)}
        />
      ) : null}

      {catalogPick ? (
        <CatalogBuyModal
          item={catalogPick}
          onClose={() => setCatalogPick(null)}
          onAdd={(line) => {
            setLines((prev) => [...prev, line]);
            if (lineHasPriceException(line)) {
              setApproveException(true);
            }
            setCatalogPick(null);
          }}
        />
      ) : null}

      {showMarket ? (
        <MarketGoldModal
          marketRefs={marketRefs}
          onClose={() => setShowMarket(false)}
          onAdd={(line) => {
            setLines((prev) => [...prev, line]);
            setShowMarket(false);
          }}
        />
      ) : null}

      {showRecent ? (
        <Modal
          title="Phiếu mua gần đây"
          wide
          onClose={() => setShowRecent(false)}
          footer={
            <button
              type="button"
              onClick={() => setShowRecent(false)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
            >
              Đóng
            </button>
          }
        >
          {recentBuys.length === 0 ? (
            <p className="text-[13px] text-[var(--tlkv-muted)]">Chưa có phiếu mua.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-[11px] text-[var(--tlkv-muted)]">
                  <tr className="border-b border-[var(--tlkv-line)]">
                    <th className="py-2 font-medium">Mã</th>
                    <th className="py-2 font-medium">Khách</th>
                    <th className="py-2 font-medium">Tổng</th>
                    <th className="py-2 font-medium">Còn trả</th>
                    <th className="py-2 font-medium">TT</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {recentBuys.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2.5 font-semibold">{row.buyNo}</td>
                      <td className="py-2.5">
                        <span className="block font-medium">{row.customerName}</span>
                        <span className="text-[11px] text-[var(--tlkv-muted)]">
                          {formatPhoneDisplay(row.customerPhone)}
                        </span>
                      </td>
                      <td className="py-2.5">{formatDong(row.totalDong)}</td>
                      <td className="py-2.5 font-medium">{formatDong(row.remainingDong)}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${paymentStatusBadgeClass(row.paymentStatus)}`}
                        >
                          {paymentStatusLabel(row.paymentStatus)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setShowRecent(false);
                            void openDetail(row.id);
                          }}
                          className="text-[12px] font-semibold text-[var(--tlkv-red)]"
                        >
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}

      {reviewing && customer ? (
        <Modal
          title="Xác nhận mua vào"
          wide
          onClose={() => !pending && setReviewing(false)}
          footer={
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => setReviewing(false)}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void onConfirmBuy()}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Đang chốt..." : "Xác nhận & lưu phiếu"}
              </button>
            </>
          }
        >
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-[var(--tlkv-amber-soft)] px-3 py-2.5 text-[13px] text-[var(--tlkv-amber)]">
            <Warning size={18} className="mt-0.5 shrink-0" />
            <p>
              Kiểm tra khách, trọng lượng và giá trước khi chốt. Hệ thống sẽ tạo phiếu mua, nhập kho
              và ghi công nợ phải trả (nếu còn) trong một bước.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
            <div>
              <p className="text-[13px] font-semibold">{customer.name}</p>
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                {formatPhoneDisplay(customer.phone)} · {customer.customerNo}
              </p>
              <table className="mt-3 w-full text-left text-[12px]">
                <thead className="text-[11px] text-[var(--tlkv-muted)]">
                  <tr className="border-b border-[var(--tlkv-line)]">
                    <th className="py-1.5 font-medium">Hàng</th>
                    <th className="py-1.5 font-medium">SL × TL</th>
                    <th className="py-1.5 text-right font-medium">Tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.localId} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2">
                        {line.productName}
                        {line.isMarketGold ? (
                          <span className="ml-1 text-[10px] text-[var(--tlkv-muted)]">(TT)</span>
                        ) : null}
                      </td>
                      <td className="py-2">
                        {line.quantity} × {formatChi(line.weightChi)}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatDong(lineTotalDong(line))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-[12px] border border-[var(--tlkv-line)] p-3 text-[13px]">
              <PreviewRow label="Tổng" value={formatDong(totalDong)} strong />
              <PreviewRow label="Trả ngay" value={formatDong(effectivePaid)} />
              <PreviewRow label="Còn trả" value={formatDong(remainingDong)} accent />
              <PreviewRow label="Hình thức" value={paymentMethodLabel(paymentMethod)} />
              {remainingDong > 0 ? (
                <PreviewRow label="Hẹn trả" value={formatViDate(dueDate)} />
              ) : null}
              {anyCatalogException ? (
                <p className="mt-2 text-[11px] font-medium text-[var(--tlkv-amber)]">
                  Có ngoại lệ giá ±300k
                  {approveException ? " (đã tick duyệt)" : " (chưa tick duyệt)"}
                </p>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {(detail || detailLoading) && (
        <Modal
          title={detail ? `Phiếu ${detail.buyNo}` : "Đang tải..."}
          wide
          onClose={() => {
            if (!collectPending) setDetail(null);
          }}
          footer={
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
            >
              Đóng
            </button>
          }
        >
          {detailLoading || !detail ? (
            <p className="text-[13px] text-[var(--tlkv-muted)]">Đang tải chi tiết...</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[13px] font-semibold">{detail.customerName}</p>
                  <p className="text-[12px] text-[var(--tlkv-muted)]">
                    {formatPhoneDisplay(detail.customerPhone)}
                    {detail.customerNo ? ` · ${detail.customerNo}` : ""}
                  </p>
                </div>
                <div className="text-[13px] sm:text-right">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${paymentStatusBadgeClass(detail.paymentStatus)}`}
                  >
                    {paymentStatusLabel(detail.paymentStatus)}
                  </span>
                  <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
                    {detail.completedAt ? formatViDateTime(detail.completedAt) : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                <DebtChip label="Tổng" value={formatDong(detail.totalDong)} />
                <DebtChip label="Đã trả" value={formatDong(detail.paidDong)} />
                <DebtChip label="Còn trả" value={formatDong(detail.remainingDong)} />
                <DebtChip
                  label="Hẹn trả"
                  value={detail.dueDate ? formatViDate(detail.dueDate) : "-"}
                />
              </div>

              <div>
                <h3 className="text-[13px] font-semibold">Hàng mua</h3>
                <table className="mt-1 w-full text-left text-[12px]">
                  <thead className="text-[11px] text-[var(--tlkv-muted)]">
                    <tr className="border-b border-[var(--tlkv-line)]">
                      <th className="py-1.5 font-medium">Tên</th>
                      <th className="py-1.5 font-medium">SL</th>
                      <th className="py-1.5 font-medium">TL</th>
                      <th className="py-1.5 text-right font-medium">Tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--tlkv-line)]">
                        <td className="py-2">
                          {item.productName}
                          {item.isMarketGold ? (
                            <span className="ml-1 text-[10px] text-[var(--tlkv-muted)]">
                              (thị trường)
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2">{item.quantity}</td>
                        <td className="py-2">{formatChi(item.weightChi)}</td>
                        <td className="py-2 text-right font-medium">
                          {formatDong(item.totalPriceDong)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detail.payments.length > 0 ? (
                <div>
                  <h3 className="text-[13px] font-semibold">Lịch sử trả tiền</h3>
                  <ul className="mt-1 space-y-1 text-[12px]">
                    {detail.payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap justify-between gap-2 border-b border-[var(--tlkv-line)] py-1.5"
                      >
                        <span>
                          {formatViDateTime(p.paidAt)} · {paymentMethodLabel(p.paymentMethod)}
                          {p.actorEmail ? (
                            <span className="text-[var(--tlkv-muted)]"> · {p.actorEmail}</span>
                          ) : null}
                        </span>
                        <span className="font-medium">{formatDong(p.amountDong)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.remainingDong > 0 ? (
                <div className="rounded-[12px] border border-[var(--tlkv-line)] p-3">
                  <h3 className="text-[13px] font-semibold">Trả thêm cho khách</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Field label="Số tiền (VND)">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={collectAmount > 0 ? String(collectAmount) : ""}
                        onChange={(e) => setCollectAmount(parseDongInput(e.target.value))}
                        className={purchaseInputClass}
                      />
                    </Field>
                    <Field label="Hình thức">
                      <select
                        value={collectMethod}
                        onChange={(e) => setCollectMethod(e.target.value as PaymentMethod)}
                        className={purchaseInputClass}
                      >
                        <option value="CASH">Tiền mặt</option>
                        <option value="TRANSFER">Chuyển khoản</option>
                        <option value="CARD">Thẻ</option>
                      </select>
                    </Field>
                    <Field label="Ngày hẹn (nếu còn)">
                      <input
                        type="date"
                        value={collectDue}
                        onChange={(e) => setCollectDue(e.target.value)}
                        className={purchaseInputClass}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    disabled={collectPending || collectAmount <= 0}
                    onClick={() => void onCollectPayment()}
                    className="mt-3 h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    {collectPending ? "Đang ghi..." : "Ghi trả thêm"}
                  </button>
                </div>
              ) : (
                <p className="text-[12px] font-medium text-[var(--tlkv-green)]">
                  Đã trả đủ cho khách trên phiếu này.
                </p>
              )}
            </div>
          )}
        </Modal>
      )}

      {alert ? <ResultAlert alert={alert} onClose={() => setAlert(null)} /> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[12px]">
      <span className="text-[var(--tlkv-muted)]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PreviewRow({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-[var(--tlkv-muted)]">{label}</span>
      <span
        className={
          accent
            ? "font-semibold text-[var(--tlkv-red)]"
            : strong
              ? "font-semibold"
              : "font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}

function DebtChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--tlkv-line)] px-2.5 py-2">
      <p className="text-[10px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold">{value}</p>
    </div>
  );
}
