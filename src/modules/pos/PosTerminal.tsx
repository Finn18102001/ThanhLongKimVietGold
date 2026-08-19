"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Barcode, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { CustomerSelectModal } from "@/modules/customer/components/CustomerSelectModal";
import type { CustomerRecord } from "@/modules/customer/types";
import { invoiceDetailPath } from "@/shared/navigation/routes";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import { completeSale } from "./actions";
import type { CartLine, PosCatalogItem } from "./types";
import { CatalogCard, ProductThumb } from "./components/CatalogCard";
import { PosCartPanel } from "./components/PosCartPanel";
import { PosCheckoutDialog } from "./components/PosCheckoutDialog";
import { PosPaymentSuccess } from "./components/PosPaymentSuccess";

const PAGE_SIZE = 8;

export function PosTerminal({
  catalog,
  walkIn,
}: {
  catalog: PosCatalogItem[];
  walkIn: CustomerRecord;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const idempotencyKey = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("Tất cả");
  const [pageIndex, setPageIndex] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [customer, setCustomer] = useState(walkIn);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER" | "CARD">("CASH");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [paid, setPaid] = useState<{
    invoiceNo: string;
    saleNo: string;
    totalDong: number;
    paymentMethod: "CASH" | "TRANSFER" | "CARD";
  } | null>(null);
  const returnToReview = useRef(false);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (!q) return;
    setQuery(q);
    setPageIndex(0);
    searchRef.current?.focus();
  }, [searchParams]);

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
    .map(([skuId, quantity]) => {
      const item = catalog.find((row) => row.skuId === skuId);
      if (!item || item.unitPriceDong === null || quantity <= 0) return null;
      return {
        skuId: item.skuId,
        sku: item.sku,
        name: item.name,
        quantity,
        unitPriceDong: item.unitPriceDong,
        imageUrl: item.imageUrl,
      };
    })
    .filter((line): line is CartLine => line !== null);

  const displayTotal = lines.reduce(
    (sum, line) => sum + line.unitPriceDong * line.quantity,
    0,
  );

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
    const inCart = cart[item.skuId] ?? 0;
    if (item.quantity <= 0) {
      setAlert({
        tone: "error",
        title: "Không đủ số lượng tồn kho",
        reason: `Sản phẩm "${item.name}" đang hết hàng.`,
        detail: `Tồn kho hiện tại: 0. Bạn đang chọn: 1.`,
      });
      return;
    }
    if (inCart + 1 > item.quantity) {
      setAlert({
        tone: "error",
        title: "Không đủ số lượng tồn kho",
        reason: `Không thể hoàn tất dòng hàng vượt tồn.`,
        detail: `Tồn kho hiện tại: ${item.quantity}. Bạn đang chọn: ${inCart + 1}.`,
      });
      return;
    }
    setCart((current) => ({
      ...current,
      [item.skuId]: inCart + 1,
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
    if (quantity > item.quantity) {
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
      [skuId]: quantity,
    }));
  }

  function removeLine(skuId: string) {
    setCart((current) => {
      const next = { ...current };
      delete next[skuId];
      return next;
    });
    setRecentIds((current) => current.filter((id) => id !== skuId));
  }

  function clearOrder() {
    const hadItems = Object.keys(cart).length > 0;
    setCart({});
    setRecentIds([]);
    setNote("");
    setCustomer(walkIn);
    setReviewing(false);
    idempotencyKey.current = null;
    if (hadItems) {
      setAlert({
        tone: "success",
        title: "Đã hủy đơn nháp",
        reason: "Giỏ hàng đã xóa. Kho không đổi vì đơn chưa hoàn tất.",
      });
    }
  }

  function openReview() {
    if (lines.length === 0 || pending) return;
    setReviewing(true);
  }

  async function onCheckout() {
    if (lines.length === 0 || pending) return;
    setPending(true);
    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
    try {
      const result = await completeSale({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        paymentMethod,
        note,
        idempotencyKey: idempotencyKey.current,
        items: lines.map((line) => ({ sku_id: line.skuId, quantity: line.quantity })),
      });
      setCart({});
      setRecentIds([]);
      setNote("");
      setCustomer(walkIn);
      setReviewing(false);
      setPaid({
        invoiceNo: result.invoice_no,
        saleNo: result.sale_no,
        totalDong: Number(result.total_dong),
        paymentMethod,
      });
      idempotencyKey.current = null;
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

  return (
    <div className="-mx-6 -my-5 flex min-h-[calc(100dvh-8rem)] flex-col bg-[var(--tlkv-bg)]">
      <div className="flex flex-1 min-h-0 flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[18px] font-semibold">Bán hàng tại quầy (POS)</h1>
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
            displayTotal={displayTotal}
            note={note}
            paymentMethod={paymentMethod}
            pending={pending}
            onOpenCustomer={() => setPickingCustomer(true)}
            onClear={clearOrder}
            onNoteChange={setNote}
            onPaymentChange={setPaymentMethod}
            onQty={setQty}
            onRemove={removeLine}
            onCheckout={openReview}
            onCancel={clearOrder}
            onAddMore={() => searchRef.current?.focus()}
          />
        </div>
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
          displayTotal={displayTotal}
          paymentMethod={paymentMethod}
          note={note}
          pending={pending}
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
          paymentMethod={paid.paymentMethod}
          onStay={() => setPaid(null)}
          onViewInvoice={() => {
            const no = paid.invoiceNo;
            setPaid(null);
            router.push(invoiceDetailPath(no));
          }}
        />
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
