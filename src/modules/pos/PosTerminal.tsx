"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowsClockwise, Barcode, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { CustomerSelectModal } from "@/modules/customer/components/CustomerSelectModal";
import type { CustomerRecord } from "@/modules/customer/types";
import { invoiceDetailPath, ROUTES } from "@/shared/navigation/routes";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import {
  cancelHeldOrder,
  completeHeldSale,
  completeSale,
  getHeldOrder,
  refreshPosStock,
  saveHeldOrder,
} from "./actions";
import {
  chargesTotalDong,
  clampAdjustmentPerChi,
  lineActualUnitDong,
  lineTotalDong,
  type PosChargeDraft,
} from "./money";
import type {
  CartLine,
  HeldOrderDetail,
  HeldOrderListResult,
  PosCatalogItem,
  PosSaleContext,
} from "./types";
import { CatalogCard, ProductThumb } from "./components/CatalogCard";
import { PosCartPanel, type PosPayMode } from "./components/PosCartPanel";
import { PosCheckoutDialog } from "./components/PosCheckoutDialog";
import { PosHeldOrdersTable } from "./components/PosHeldOrdersTable";
import { PosPaymentSuccess } from "./components/PosPaymentSuccess";

type CartQtyMap = Record<string, { quantity: number; adj: number }>;

const PAGE_SIZE = 8;

function defaultDueDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolvePaidDong(payMode: PosPayMode, paidDong: number, displayTotal: number): number {
  if (payMode === "FULL") return displayTotal;
  if (payMode === "UNPAID") return 0;
  return Math.max(0, paidDong);
}

function defaultPickupDueAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toCartLine(item: PosCatalogItem, quantity: number, adj: number): CartLine | null {
  if (item.unitPriceDong === null || quantity <= 0) return null;
  const clamped = clampAdjustmentPerChi(adj);
  return {
    skuId: item.skuId,
    sku: item.sku,
    name: item.name,
    quantity,
    weightChi: item.weightChi,
    stock: item.quantity,
    referenceUnitPriceDong: item.unitPriceDong,
    priceAdjustmentPerChi: clamped,
    unitPriceDong: lineActualUnitDong(item.unitPriceDong, clamped, item.weightChi),
    imageUrl: item.imageUrl,
  };
}

function customerFromHold(detail: HeldOrderDetail, walkIn: CustomerRecord): CustomerRecord {
  if (detail.isWalkIn || !detail.customerId || detail.customerId === walkIn.id) {
    return walkIn;
  }
  return {
    ...walkIn,
    id: detail.customerId,
    customerNo: detail.customerNo ?? "",
    name: detail.customerName,
    phone: detail.customerPhone,
    isWalkIn: false,
    documents: [],
  };
}

export function PosTerminal({
  catalog: initialCatalog,
  walkIn,
  initialHeldOrders,
  saleContext,
}: {
  catalog: PosCatalogItem[];
  walkIn: CustomerRecord;
  initialHeldOrders: HeldOrderListResult;
  saleContext: PosSaleContext;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const idempotencyKey = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState(initialCatalog);
  const [stockRefreshing, setStockRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("Tất cả");
  const [pageIndex, setPageIndex] = useState(0);
  const [cart, setCart] = useState<CartQtyMap>({});
  const [charges, setCharges] = useState<PosChargeDraft[]>([]);
  const [operatorStaffId, setOperatorStaffId] = useState("");
  const [pickupDueAt, setPickupDueAt] = useState(defaultPickupDueAt);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [customer, setCustomer] = useState(walkIn);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER" | "CARD">("CASH");
  const [payMode, setPayMode] = useState<PosPayMode>("FULL");
  const [paidDong, setPaidDong] = useState(0);
  const [dueDate, setDueDate] = useState(defaultDueDateIso);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [savingHold, setSavingHold] = useState(false);
  const [heldList, setHeldList] = useState(initialHeldOrders.items);
  const [heldVisibleToAll, setHeldVisibleToAll] = useState(initialHeldOrders.visibleToAll);
  const [heldLoading, setHeldLoading] = useState(false);
  const [heldBusyId, setHeldBusyId] = useState<string | null>(null);
  const [activeHeldOrderId, setActiveHeldOrderId] = useState<string | null>(null);
  const [activeHoldNo, setActiveHoldNo] = useState<string | null>(null);
  const [replaceHoldId, setReplaceHoldId] = useState<string | null>(null);
  const [cancelHoldId, setCancelHoldId] = useState<string | null>(null);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [paid, setPaid] = useState<{
    invoiceNo: string;
    saleNo: string;
    totalDong: number;
    paidDong: number;
    remainingDong: number;
    paymentMethod: "CASH" | "TRANSFER" | "CARD";
    transactionType?: string;
    fulfillmentStatus?: string;
  } | null>(null);
  const returnToReview = useRef(false);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (!q) return;
    setQuery(q);
    setPageIndex(0);
    searchRef.current?.focus();
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function pullStock() {
      setStockRefreshing(true);
      try {
        const map = await refreshPosStock();
        if (cancelled) return;
        setCatalog((current) =>
          current.map((item) => ({
            ...item,
            quantity: map[item.skuId] ?? item.quantity,
          })),
        );
      } catch (err) {
        if (cancelled) return;
        setAlert({
          tone: "error",
          title: "Không làm mới được tồn kho",
          reason: err instanceof Error ? err.message : "Không tải được số lượng tồn hiện tại.",
        });
      } finally {
        if (!cancelled) setStockRefreshing(false);
      }
    }

    void pullStock();

    function onVisibility() {
      if (document.visibilityState === "visible") void pullStock();
    }
    function onFocus() {
      void pullStock();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const groups = useMemo(() => {
    const unique = Array.from(new Set(catalog.map((item) => item.browseGroup)));
    return ["Tất cả", ...unique];
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesGroup = group === "Tất cả" || item.browseGroup === group;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchesGroup && matchesQuery;
    });
  }, [catalog, group, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);

  const lines: CartLine[] = Object.entries(cart)
    .map(([skuId, entry]) => {
      const item = catalog.find((row) => row.skuId === skuId);
      if (!item) return null;
      return toCartLine(item, entry.quantity, entry.adj);
    })
    .filter((line): line is CartLine => line !== null);

  const merchandiseTotal = lines.reduce(
    (sum, line) =>
      sum +
      lineTotalDong(
        line.referenceUnitPriceDong,
        line.priceAdjustmentPerChi,
        line.weightChi,
        line.quantity,
      ),
    0,
  );
  const extraDong = chargesTotalDong(charges);
  const displayTotal = merchandiseTotal + extraDong;
  const isPreorder = lines.some((line) => line.stock <= 0);
  const operatorName =
    saleContext.operators.find((op) => op.id === operatorStaffId)?.fullName ?? null;

  const effectivePaidDong = resolvePaidDong(payMode, paidDong, displayTotal);
  const remainingDong = Math.max(0, displayTotal - effectivePaidDong);

  const recentItems = recentIds
    .map((id) => catalog.find((item) => item.skuId === id))
    .filter((item): item is PosCatalogItem => Boolean(item));

  useEffect(() => {
    setPageIndex(0);
  }, [query, group]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "F3") {
        event.preventDefault();
        setPickingCustomer(true);
      }
      if (event.key === "F8") {
        event.preventDefault();
        clearOrder();
      }
      if (event.key === "F9") {
        event.preventDefault();
        if (paid) return;
        if (pickingCustomer) return;
        if (savingHold) return;
        if (reviewing) void onCheckout();
        else openReview();
      }
      if (event.key === "Delete" && lines.length > 0) {
        event.preventDefault();
        removeLine(lines[lines.length - 1].skuId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function addItem(item: PosCatalogItem) {
    if (item.unitPriceDong === null) {
      setAlert({
        tone: "error",
        title: "Không thêm được sản phẩm",
        reason: `Mã hàng ${item.sku} chưa có giá bán, không thể thêm vào đơn.`,
      });
      return;
    }
    const inCart = cart[item.skuId]?.quantity ?? 0;
    if (item.quantity > 0 && inCart + 1 > item.quantity) {
      setAlert({
        tone: "error",
        title: "Không đủ số lượng tồn kho",
        reason: `Không thể bán vượt tồn. Hết hàng thì thêm để đặt hàng, không được đặt khi còn tồn nhưng thiếu SL.`,
        detail: `Tồn kho hiện tại: ${item.quantity}. Bạn đang chọn: ${inCart + 1}.`,
      });
      return;
    }
    setCart((current) => ({
      ...current,
      [item.skuId]: {
        quantity: inCart + 1,
        adj: current[item.skuId]?.adj ?? 0,
      },
    }));
    setRecentIds((current) => [item.skuId, ...current.filter((id) => id !== item.skuId)].slice(0, 8));
  }

  function setQty(skuId: string, quantity: number) {
    const item = catalog.find((row) => row.skuId === skuId);
    if (!item) return;
    if (quantity <= 0) {
      removeLine(skuId);
      return;
    }
    if (item.quantity > 0 && quantity > item.quantity) {
      setAlert({
        tone: "error",
        title: "Không đủ số lượng tồn kho",
        reason: `Sản phẩm "${item.name}" không đủ tồn để bán số lượng này.`,
        detail: `Tồn kho hiện tại: ${item.quantity}. Bạn đang chọn: ${quantity}.`,
      });
      return;
    }
    setCart((current) => ({
      ...current,
      [skuId]: {
        quantity,
        adj: current[skuId]?.adj ?? 0,
      },
    }));
  }

  function setAdj(skuId: string, adj: number) {
    setCart((current) => {
      const entry = current[skuId];
      if (!entry) return current;
      return {
        ...current,
        [skuId]: { ...entry, adj: clampAdjustmentPerChi(adj) },
      };
    });
  }

  function removeLine(skuId: string) {
    setCart((current) => {
      const next = { ...current };
      delete next[skuId];
      return next;
    });
    setRecentIds((current) => current.filter((id) => id !== skuId));
  }

  function resetDraft() {
    setCart({});
    setCharges([]);
    setOperatorStaffId("");
    setPickupDueAt(defaultPickupDueAt());
    setRecentIds([]);
    setNote("");
    setCustomer(walkIn);
    setPayMode("FULL");
    setPaidDong(0);
    setDueDate(defaultDueDateIso());
    setReviewing(false);
    setPaymentMethod("CASH");
    setActiveHeldOrderId(null);
    setActiveHoldNo(null);
    idempotencyKey.current = null;
  }

  function clearOrder() {
    const hadItems = Object.keys(cart).length > 0;
    const holdNo = activeHoldNo;
    resetDraft();
    if (hadItems) {
      setAlert({
        tone: "success",
        title: holdNo ? "Đã đóng đơn đang soạn" : "Đã hủy đơn nháp",
        reason: holdNo
          ? `Giỏ đã xóa. Đơn ${holdNo} vẫn nằm trong danh sách lưu đơn.`
          : "Giỏ hàng đã xóa. Kho không đổi vì đơn chưa hoàn tất.",
      });
    }
  }

  async function onSaveHold() {
    const items = Object.entries(cart)
      .map(([skuId, entry]) => {
        const item = catalog.find((row) => row.skuId === skuId);
        if (!item || entry.quantity <= 0) return null;
        return { sku_id: skuId, quantity: entry.quantity };
      })
      .filter((row): row is { sku_id: string; quantity: number } => row !== null);
    if (items.length === 0 || pending || savingHold) return;
    setSavingHold(true);
    try {
      const saved = await saveHeldOrder({
        customerId: customer.id,
        paymentMethod,
        note,
        heldOrderId: activeHeldOrderId,
        items,
      });
      resetDraft();
      setHeldList((current) => {
        const next = current.filter((row) => row.id !== saved.id);
        return [saved, ...next];
      });
      setHeldVisibleToAll(saved.visibleToAll);
      setAlert({
        tone: "success",
        title: "Đã lưu đơn",
        reason: `${saved.holdNo} chưa thanh toán. Kho chưa trừ. Quầy trống để nhận khách tiếp.`,
      });
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không lưu được đơn",
        reason: err instanceof Error ? err.message : "Lưu đơn thất bại. Giỏ hàng vẫn giữ nguyên.",
      });
    } finally {
      setSavingHold(false);
    }
  }

  function requestResumeHold(id: string) {
    if (pending || savingHold) return;
    const hasItems = Object.keys(cart).length > 0;
    if (hasItems && activeHeldOrderId !== id) {
      setReplaceHoldId(id);
      return;
    }
    void applyHeldOrder(id);
  }

  async function applyHeldOrder(id: string) {
    setHeldBusyId(id);
    setReplaceHoldId(null);
    try {
      const detail = await getHeldOrder(id);
      const nextCart: CartQtyMap = {};
      const missing: string[] = [];
      const overStock: string[] = [];
      for (const item of detail.items) {
        const cat = catalog.find((row) => row.skuId === item.skuId);
        if (!cat || cat.unitPriceDong === null) {
          missing.push(item.sku);
          continue;
        }
        nextCart[item.skuId] = { quantity: item.quantity, adj: 0 };
        if (cat.quantity > 0 && item.quantity > cat.quantity) {
          overStock.push(`${item.name} (tồn ${cat.quantity}, đơn ${item.quantity})`);
        }
      }
      if (Object.keys(nextCart).length === 0) {
        setAlert({
          tone: "error",
          title: "Không mở được đơn đã lưu",
          reason: "Không còn sản phẩm nào trên quầy để điền lại giỏ.",
          detail: missing.length ? `Mã không còn bán: ${missing.join(", ")}.` : undefined,
        });
        return;
      }
      setCart(nextCart);
      setRecentIds(Object.keys(nextCart));
      setCustomer(customerFromHold(detail, walkIn));
      setNote(detail.note ?? "");
      setPaymentMethod(detail.paymentMethod);
      setPayMode("FULL");
      setPaidDong(0);
      setDueDate(defaultDueDateIso());
      setReviewing(false);
      setActiveHeldOrderId(detail.id);
      setActiveHoldNo(detail.holdNo);
      idempotencyKey.current = null;
      if (missing.length || overStock.length) {
        setAlert({
          tone: "error",
          title: "Đã mở đơn, cần kiểm tra giỏ",
          reason: missing.length
            ? `Một số mã không còn trên quầy: ${missing.join(", ")}.`
            : "Một số dòng vượt tồn hiện tại. Điều chỉnh trước khi thanh toán.",
          detail: overStock.length ? overStock.join(". ") : undefined,
        });
      }
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không mở được đơn đã lưu",
        reason: err instanceof Error ? err.message : "Không tải được chi tiết đơn lưu.",
      });
    } finally {
      setHeldBusyId(null);
    }
  }

  async function confirmCancelHold(id: string) {
    setHeldBusyId(id);
    setCancelHoldId(null);
    try {
      const result = await cancelHeldOrder(id);
      setHeldList((current) => current.filter((row) => row.id !== id));
      if (activeHeldOrderId === id) {
        resetDraft();
      }
      setAlert({
        tone: "success",
        title: "Đã hủy đơn lưu",
        reason: `${result.holdNo} đã đóng. Kho không đổi.`,
      });
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không hủy được đơn lưu",
        reason: err instanceof Error ? err.message : "Hủy đơn lưu thất bại.",
      });
    } finally {
      setHeldBusyId(null);
    }
  }

  function paymentValidationError(): string | null {
    if (saleContext.isShared && !operatorStaffId) {
      return "Tài khoản dùng chung phải chọn nhân viên đứng quầy.";
    }
    if (isPreorder && !pickupDueAt) {
      return "Đơn đặt hàng phải có thời điểm hẹn trả hàng.";
    }
    for (const charge of charges) {
      const named = charge.name.trim();
      if (!named && charge.amountDong <= 0 && !charge.reason.trim()) continue;
      if (!named) return "Khoản thu thêm phải có tên.";
      if (charge.amountDong <= 0) return "Khoản thu thêm phải lớn hơn 0. Không dùng khoản âm để giảm giá.";
      if (!charge.reason.trim()) return `Khoản "${named}" cần lý do.`;
    }
    if (payMode === "FULL") return null;
    if (!dueDate) return "Đơn còn nợ phải có ngày hẹn trả tiền.";
    if (payMode === "PARTIAL") {
      if (paidDong <= 0) return "Thanh toán một phần cần số tiền thu lớn hơn 0.";
      if (paidDong >= displayTotal) {
        return "Số tiền một phần phải nhỏ hơn tổng đơn. Chọn Đủ nếu thu hết.";
      }
    }
    return null;
  }

  function openReview() {
    if (lines.length === 0 || pending) return;
    const error = paymentValidationError();
    if (error) {
      setAlert({
        tone: "error",
        title: "Không thể xác nhận thanh toán",
        reason: error,
      });
      return;
    }
    setReviewing(true);
  }

  async function onCheckout() {
    if (lines.length === 0 || pending) return;
    const error = paymentValidationError();
    if (error) {
      setAlert({
        tone: "error",
        title: "Không thể xác nhận thanh toán",
        reason: error,
      });
      return;
    }
    setPending(true);
    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
    const paidToSend = resolvePaidDong(payMode, paidDong, displayTotal);
    const dueToSend = payMode === "FULL" ? null : dueDate;
    const chargePayload = charges
      .filter((row) => row.name.trim() && row.amountDong > 0)
      .map((row) => ({
        name: row.name.trim(),
        amount_dong: row.amountDong,
        reason: row.reason.trim(),
      }));
    const payload = {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      paymentMethod,
      note,
      idempotencyKey: idempotencyKey.current,
      paidDong: paidToSend,
      dueDate: dueToSend,
      charges: chargePayload,
      operatorStaffId: saleContext.isShared ? operatorStaffId : null,
      pickupDueAt: isPreorder ? new Date(pickupDueAt).toISOString() : null,
      items: lines.map((line) => ({
        sku_id: line.skuId,
        quantity: line.quantity,
        price_adjustment_per_chi: line.priceAdjustmentPerChi,
      })),
    };
    try {
      const result = activeHeldOrderId
        ? await completeHeldSale({ ...payload, heldOrderId: activeHeldOrderId })
        : await completeSale(payload);
      const closedHoldId = activeHeldOrderId;
      resetDraft();
      if (closedHoldId) {
        setHeldList((current) => current.filter((row) => row.id !== closedHoldId));
      }
      setPaid({
        invoiceNo: result.invoice_no,
        saleNo: result.sale_no,
        totalDong: Number(result.total_dong),
        paidDong: Number(result.paid_dong),
        remainingDong: Number(result.remaining_dong),
        paymentMethod,
        transactionType: result.transaction_type,
        fulfillmentStatus: result.fulfillment_status,
      });
      idempotencyKey.current = null;
      void refreshPosStock().then((map) => {
        setCatalog((current) =>
          current.map((item) => ({
            ...item,
            quantity: map[item.skuId] ?? item.quantity,
          })),
        );
      });
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không hoàn tất được giao dịch",
        reason: err instanceof Error ? err.message : "Thanh toán hoặc phát hành hóa đơn thất bại.",
        detail:
          "Đơn chưa hoàn tất. Hóa đơn chưa phát hành. Kho chưa trừ. Bạn có thể thử lại với cùng đơn này.",
      });
    } finally {
      setPending(false);
    }
  }

  async function onManualStockRefresh() {
    setStockRefreshing(true);
    try {
      const map = await refreshPosStock();
      setCatalog((current) =>
        current.map((item) => ({
          ...item,
          quantity: map[item.skuId] ?? item.quantity,
        })),
      );
    } catch (err) {
      setAlert({
        tone: "error",
        title: "Không làm mới được tồn kho",
        reason: err instanceof Error ? err.message : "Không tải được số lượng tồn hiện tại.",
      });
    } finally {
      setStockRefreshing(false);
    }
  }

  return (
    <div className="-mx-6 -my-5 flex min-h-[calc(100dvh-8rem)] flex-col bg-[var(--tlkv-bg)]">
      <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[18px] font-semibold">Bán hàng tại quầy (POS)</h1>
            <Link
              href={ROUTES.purchase}
              className="text-[12px] font-semibold text-[var(--tlkv-red)] hover:underline"
            >
              Mua vào →
            </Link>
          </div>
          <label className="relative min-w-[240px] flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm sản phẩm (mã, tên...)"
              className="h-10 w-full rounded-full border border-[var(--tlkv-line)] bg-white pr-14 pl-9 text-[13px] outline-none focus:border-[var(--tlkv-red)]"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded bg-[var(--tlkv-bg)] px-1.5 text-[10px] text-[var(--tlkv-muted)]">
              F2
            </kbd>
          </label>
          <button
            type="button"
            onClick={() => searchRef.current?.focus()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-medium"
          >
            <Barcode size={16} />
            Quét mã vạch
          </button>
          <button
            type="button"
            disabled={stockRefreshing}
            onClick={() => void onManualStockRefresh()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-medium disabled:opacity-60"
          >
            <ArrowsClockwise size={16} className={stockRefreshing ? "animate-spin" : undefined} />
            {stockRefreshing ? "Đang cập nhật tồn..." : "Làm mới tồn kho"}
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="flex min-h-0 flex-col rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {groups.map((item) => {
                const active = item === group;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setGroup(item)}
                    className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-medium ${
                      active
                        ? "bg-[var(--tlkv-red)] text-white"
                        : "bg-[var(--tlkv-bg)] text-[var(--tlkv-text)] hover:bg-[var(--tlkv-red-soft)]"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3 xl:grid-cols-4">
              {pageItems.length === 0 ? (
                <p className="col-span-full py-10 text-center text-[13px] text-[var(--tlkv-muted)]">
                  Không có sản phẩm khớp tìm kiếm.
                </p>
              ) : (
                pageItems.map((item) => (
                  <CatalogCard key={item.skuId} item={item} onAdd={addItem} />
                ))
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-[12px] text-[var(--tlkv-muted)]">
              <p>
                {filtered.length === 0 ? 0 : pageIndex * PAGE_SIZE + 1} -{" "}
                {Math.min((pageIndex + 1) * PAGE_SIZE, filtered.length)} / {filtered.length} SP
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
                  className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={pageIndex + 1 >= pageCount}
                  onClick={() => setPageIndex((value) => value + 1)}
                  className="h-8 rounded-lg border border-[var(--tlkv-line)] px-2 disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>

            <div className="mt-3 border-t border-[var(--tlkv-line)] pt-3">
              <p className="text-[12px] font-semibold">Sản phẩm vừa chọn</p>
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {recentItems.length === 0 ? (
                  <p className="text-[12px] text-[var(--tlkv-muted)]">Chưa chọn món nào.</p>
                ) : (
                  recentItems.map((item) => (
                    <div key={item.skuId} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                      <ProductThumb name={item.name} imageUrl={item.imageUrl} size={56} />
                      <button
                        type="button"
                        aria-label={`Bỏ ${item.name}`}
                        onClick={() => removeLine(item.skuId)}
                        className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => searchRef.current?.focus()}
                  className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--tlkv-line)] text-[10px] text-[var(--tlkv-muted)]"
                >
                  <Plus size={14} />
                  Chọn thêm
                </button>
              </div>
            </div>
          </section>

          <PosCartPanel
            customer={customer}
            lines={lines}
            merchandiseTotal={merchandiseTotal}
            charges={charges}
            displayTotal={displayTotal}
            note={note}
            paymentMethod={paymentMethod}
            payMode={payMode}
            paidDong={paidDong}
            dueDate={dueDate}
            pending={pending}
            isPreorder={isPreorder}
            isShared={saleContext.isShared}
            operators={saleContext.operators}
            operatorStaffId={operatorStaffId}
            pickupDueAt={pickupDueAt}
            onOpenCustomer={() => setPickingCustomer(true)}
            onClear={clearOrder}
            onNoteChange={setNote}
            onPaymentChange={setPaymentMethod}
            onPayModeChange={setPayMode}
            onPaidDongChange={setPaidDong}
            onDueDateChange={setDueDate}
            onQty={setQty}
            onAdj={setAdj}
            onRemove={removeLine}
            onChargesChange={setCharges}
            onOperatorChange={setOperatorStaffId}
            onPickupDueAtChange={setPickupDueAt}
            onCheckout={openReview}
            onCancel={clearOrder}
            onAddMore={() => searchRef.current?.focus()}
            onSave={() => void onSaveHold()}
            saving={savingHold}
            heldHoldNo={activeHoldNo}
          />
        </div>

        <PosHeldOrdersTable
          items={heldList}
          visibleToAll={heldVisibleToAll}
          activeHoldId={activeHeldOrderId}
          loading={heldLoading}
          busyId={heldBusyId}
          onResume={requestResumeHold}
          onCancel={(id) => setCancelHoldId(id)}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--tlkv-line)] bg-white px-6 py-2 text-[12px] text-[var(--tlkv-muted)]">
        <Shortcut keys="F2" label="Tìm sản phẩm" />
        <Shortcut keys="F3" label="Khách hàng" />
        <Shortcut keys="Del" label="Xóa dòng" />
        <Shortcut keys="F8" label="Hủy đơn" />
        <Shortcut keys="F9" label="Thanh toán" />
      </div>

      {pickingCustomer ? (
        <CustomerSelectModal
          onClose={() => {
            setPickingCustomer(false);
            if (returnToReview.current) {
              returnToReview.current = false;
              setReviewing(true);
            }
          }}
          onSelect={(selected) => {
            setCustomer(selected);
            setPickingCustomer(false);
            if (returnToReview.current) {
              returnToReview.current = false;
              setReviewing(true);
            }
          }}
        />
      ) : null}

      {reviewing ? (
        <PosCheckoutDialog
          customer={customer}
          lines={lines}
          charges={charges}
          displayTotal={displayTotal}
          paymentMethod={paymentMethod}
          note={note}
          paidDong={effectivePaidDong}
          remainingDong={remainingDong}
          dueDate={payMode === "FULL" ? null : dueDate}
          pending={pending}
          isPreorder={isPreorder}
          operatorName={operatorName}
          pickupDueAt={isPreorder ? pickupDueAt : null}
          onClose={() => setReviewing(false)}
          onConfirm={() => void onCheckout()}
          onChangeCustomer={() => {
            returnToReview.current = true;
            setReviewing(false);
            setPickingCustomer(true);
          }}
        />
      ) : null}

      {paid ? (
        <PosPaymentSuccess
          invoiceNo={paid.invoiceNo}
          saleNo={paid.saleNo}
          totalDong={paid.totalDong}
          paidDong={paid.paidDong}
          remainingDong={paid.remainingDong}
          paymentMethod={paid.paymentMethod}
          transactionType={paid.transactionType}
          fulfillmentStatus={paid.fulfillmentStatus}
          onStay={() => setPaid(null)}
          onViewInvoice={() => {
            const no = paid.invoiceNo;
            setPaid(null);
            router.push(invoiceDetailPath(no));
          }}
        />
      ) : null}

      {replaceHoldId || cancelHoldId ? (
        <ResultAlert
          alert={{
            tone: "error",
            title: replaceHoldId ? "Thay giỏ hiện tại?" : "Hủy đơn đã lưu?",
            reason: replaceHoldId
              ? "Giỏ đang có sản phẩm. Mở đơn đã lưu sẽ thay toàn bộ giỏ, không gộp."
              : "Đơn lưu sẽ đóng. Kho không đổi. Nếu đơn này đang mở trên giỏ, giỏ cũng sẽ xóa.",
          }}
          onClose={() => {
            setReplaceHoldId(null);
            setCancelHoldId(null);
          }}
        >
          <button
            type="button"
            onClick={() => {
              setReplaceHoldId(null);
              setCancelHoldId(null);
            }}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
          >
            Không
          </button>
          <button
            type="button"
            onClick={() => {
              if (replaceHoldId) void applyHeldOrder(replaceHoldId);
              else if (cancelHoldId) void confirmCancelHold(cancelHoldId);
            }}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
          >
            {replaceHoldId ? "Mở đơn" : "Hủy đơn lưu"}
          </button>
        </ResultAlert>
      ) : null}

      {alert ? (
        <ResultAlert
          alert={alert}
          onClose={() => setAlert(null)}
        >
          {alert.tone === "error" && reviewing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setAlert(null);
                  setReviewing(false);
                }}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium"
              >
                Quay lại đơn hàng
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlert(null);
                  void onCheckout();
                }}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
              >
                Thử lại
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAlert(null)}
              className={`h-10 rounded-lg px-4 text-[13px] font-semibold text-white ${
                alert.tone === "success" ? "bg-[var(--tlkv-green)]" : "bg-[var(--tlkv-red)]"
              }`}
            >
              Đã hiểu
            </button>
          )}
        </ResultAlert>
      ) : null}
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded bg-[var(--tlkv-bg)] px-1.5 py-0.5 font-semibold text-[var(--tlkv-text)]">
        {keys}
      </kbd>
      {label}
    </span>
  );
}
