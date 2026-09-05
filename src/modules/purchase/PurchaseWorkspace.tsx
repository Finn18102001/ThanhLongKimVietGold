"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ClockCounterClockwise, Printer, Warning } from "@phosphor-icons/react";
import { CustomerSelectModal } from "@/modules/customer/components/CustomerSelectModal";
import { formatPhoneDisplay } from "@/modules/customer/labels";
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
import { MarketGoldModal } from "./components/MarketGoldModal";
import { PurchaseCartPanel } from "./components/PurchaseCartPanel";
import { PurchaseCatalogPanel } from "./components/PurchaseCatalogPanel";
import { PurchaseVoucherDocument } from "./components/PurchaseVoucherDocument";
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
  clampBuyUnitPriceDong,
  lineHasPriceException,
  lineTotalDong,
  toBuyItemPayload,
  type BuyDetail,
  type BuyLine,
  type BuyListRow,
  type BuyPayMode,
  type CatalogBuyLine,
  type DebtSummary,
  type MarketBuyLine,
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

  const [recentBuys, setRecentBuys] = useState(initialBuys);
  const [lines, setLines] = useState<BuyLine[]>([]);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [debt, setDebt] = useState<DebtSummary | null>(null);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [showMarket, setShowMarket] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [payMode, setPayMode] = useState<BuyPayMode>("FULL");
  const [paidDong, setPaidDong] = useState(0);
  const [dueDate, setDueDate] = useState(defaultDueDateIso);
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [success, setSuccess] = useState<{
    buyId: string;
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
        title: "Chưa chọn khách hàng",
        reason: "Vui lòng chọn khách hàng trước khi xác nhận hóa đơn.",
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
      prev.map((line): BuyLine => {
        if (line.localId !== localId) return line;
        if (line.kind === "catalog") {
          const nextQty =
            patch.quantity !== undefined
              ? Math.max(1, Math.trunc(patch.quantity) || 1)
              : line.quantity;
          const nextUnit =
            patch.unitPriceDong !== undefined
              ? clampBuyUnitPriceDong(
                  patch.unitPriceDong,
                  line.referencePriceDongPerChi,
                  false,
                )
              : line.unitPriceDong;
          const catalogPatch = patch as Partial<CatalogBuyLine>;
          return {
            ...line,
            ...catalogPatch,
            kind: "catalog",
            isMarketGold: false,
            skuId: catalogPatch.skuId ?? line.skuId,
            sku: catalogPatch.sku ?? line.sku,
            unitPriceDong: nextUnit,
            quantity: nextQty,
          };
        }
        const marketPatch = patch as Partial<MarketBuyLine>;
        return {
          ...line,
          ...marketPatch,
          kind: "market",
          isMarketGold: true,
          quantity:
            patch.quantity !== undefined
              ? Math.max(1, Math.trunc(patch.quantity) || 1)
              : line.quantity,
        };
      }),
    );
  }

  /** Click catalog → add/bump line on cart (POS-like; edit qty/price on invoice). */
  function addCatalogItem(item: PurchaseCatalogItem) {
    const reference = item.referenceSellDongPerChi;
    if (reference <= 0) {
      setAlert({
        tone: "error",
        title: "Chưa có giá",
        reason: "Sản phẩm chưa có giá niêm yết / chỉ.",
      });
      return;
    }
    const suggested =
      item.suggestedBuyDongPerChi > 0 ? item.suggestedBuyDongPerChi : reference;
    const unit = clampBuyUnitPriceDong(suggested, reference, false);
    const weight = item.weightChi > 0 ? item.weightChi : 1;

    setLines((prev) => {
      const existing = prev.find(
        (line): line is CatalogBuyLine =>
          line.kind === "catalog" && line.skuId === item.skuId,
      );
      if (existing) {
        return prev.map((line) =>
          line.localId === existing.localId
            ? { ...existing, quantity: existing.quantity + 1 }
            : line,
        );
      }
      const next: CatalogBuyLine = {
        kind: "catalog",
        isMarketGold: false,
        localId: crypto.randomUUID(),
        skuId: item.skuId,
        sku: item.sku,
        productName: item.name,
        goldType: item.goldTypeHint || item.browseGroup || "Catalog",
        goldAge: item.goldAgeHint || "",
        quantity: 1,
        weightChi: weight,
        unitPriceDong: unit,
        referencePriceDongPerChi: reference,
        priceRowId: item.priceRowId,
        imageUrl: item.imageUrl,
        brandName: item.brandName,
      };
      return [...prev, next];
    });
  }

  function resetDraft() {
    setLines([]);
    setNote("");
    setPayMode("FULL");
    setPaidDong(0);
    setDueDate(defaultDueDateIso());
    setSuccess(null);
    idempotencyKey.current = null;
  }

  function openReview() {
    if (!customer || customer.isWalkIn) {
      setAlert({
        tone: "error",
        title: "Chưa chọn khách hàng",
        reason: "Vui lòng chọn khách hàng trước khi xác nhận hóa đơn.",
      });
      setPickingCustomer(true);
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
    if (anyCatalogException) {
      setAlert({
        tone: "error",
        title: "Giá ngoài khoảng ±300.000đ",
        reason:
          "Có dòng catalog vượt ±300.000đ/chỉ so với giá niêm yết. Chỉnh giá (nhập trực tiếp hoặc ±) về trong khoảng trước khi chốt. Không cho thanh toán khi ngoài khoảng.",
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
        approvePriceException: false,
        priceExceptionReason: null,
        idempotencyKey: idempotencyKey.current || crypto.randomUUID(),
      });
      setSuccess({
        buyId: result.buyId,
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

  const searchParams = useSearchParams();
  useEffect(() => {
    const buyId = searchParams.get("buy");
    if (buyId) void openDetail(buyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open from invoice directory
  }, [searchParams]);

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
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[18px] font-semibold">Mua hàng từ khách</h1>
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
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void openDetail(success.buyId)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--tlkv-red)]"
              >
                <Printer size={14} />
                In phiếu mua
              </button>
              <button
                type="button"
                onClick={resetDraft}
                className="text-[12px] font-semibold text-[var(--tlkv-red)]"
              >
                Tạo phiếu mua mới
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-h-0 flex-col gap-4">
            <PurchaseCatalogPanel
              catalog={catalog}
              onPickCatalog={addCatalogItem}
              onOpenMarket={() => setShowMarket(true)}
            />
          </div>

          <PurchaseCartPanel
            customer={customer}
            debt={debt}
            lines={lines}
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
            pending={pending}
            anyCatalogException={anyCatalogException}
            onOpenCustomer={() => setPickingCustomer(true)}
            onClear={resetDraft}
            onChangeLine={onChangeLine}
            onRemove={(id) => setLines((prev) => prev.filter((l) => l.localId !== id))}
            onCheckout={openReview}
          />
        </div>
      </div>

      {pickingCustomer ? (
        <CustomerSelectModal
          onClose={() => setPickingCustomer(false)}
          onSelect={(c) => void onSelectCustomer(c)}
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
                <p className="mt-2 text-[11px] font-medium text-[var(--tlkv-red)]">
                  Có dòng ngoài khoảng ±300k - không cho chốt. Quay lại chỉnh giá.
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
              >
                <Printer size={16} />
                In phiếu
              </button>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
              >
                Đóng
              </button>
            </div>
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
                      <th className="py-1.5 font-medium">Brand</th>
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
                        <td className="py-2">{item.brandName || "—"}</td>
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
      {detail ? (
        <div className="hidden print:block">
          <PurchaseVoucherDocument buy={detail} />
        </div>
      ) : null}
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
