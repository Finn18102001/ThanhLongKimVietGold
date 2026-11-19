"use client";

import { useMemo, useState, useTransition } from "react";
import { formatActionError } from "@/shared/lib/action-result";
import {
  adminAllocateGold,
  adminCapitalGold,
  createStaffGoldAccount,
  refreshEmployeeGoldAccounts,
  refreshEmployeeGoldCounts,
  refreshEmployeeGoldLedger,
  refreshEmployeeGoldStock,
  searchGoldSkuOptions,
  submitGoldCount,
  transferEmployeeGold,
} from "./actions";
import type {
  EmployeeGoldAccount,
  EmployeeGoldCountRow,
  EmployeeGoldLedgerPage,
  EmployeeGoldStockRow,
  GoldSkuOption,
} from "./types";

type StaffOption = { id: string; fullName: string; email: string };
type TabId = "stock" | "count" | "ledger" | "transfer";

const TXN_LABEL: Record<string, string> = {
  ADMIN_CAPITAL_IN: "Nạp vàng Admin",
  ADMIN_CAPITAL_OUT: "Rút vàng Admin",
  ADMIN_ALLOCATE: "Phân bổ Admin",
  SALE_OUT: "Xuất bán",
  PURCHASE_IN: "Nhập mua",
  TRANSFER: "Chuyển vàng",
  VOID_REVERSAL: "Đảo hủy",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

const TABS: { id: TabId; label: string }[] = [
  { id: "stock", label: "Tồn kho" },
  { id: "count", label: "Kiểm kê" },
  { id: "ledger", label: "Lịch sử biến động" },
  { id: "transfer", label: "Chuyển vàng" },
];

export function FundGoldWorkspace({
  initialAccounts,
  initialStock,
  initialLedger,
  initialCounts,
  canMutate,
  canTransfer,
  staffOptions,
}: {
  initialAccounts: EmployeeGoldAccount[];
  initialStock: EmployeeGoldStockRow[];
  initialLedger: EmployeeGoldLedgerPage;
  initialCounts: EmployeeGoldCountRow[];
  canMutate: boolean;
  canTransfer: boolean;
  staffOptions: StaffOption[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [stock, setStock] = useState(initialStock);
  const [ledger, setLedger] = useState(initialLedger);
  const [counts, setCounts] = useState(initialCounts);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAccounts[0]?.id ?? null,
  );
  const [tab, setTab] = useState<TabId>("stock");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [staffId, setStaffId] = useState("");
  const [skuQuery, setSkuQuery] = useState("");
  const [skuOptions, setSkuOptions] = useState<GoldSkuOption[]>([]);
  const [capitalSkuId, setCapitalSkuId] = useState("");
  const [capitalQty, setCapitalQty] = useState("");
  const [capitalDir, setCapitalDir] = useState<"IN" | "OUT">("IN");
  const [allocAccountId, setAllocAccountId] = useState("");
  const [allocSkuId, setAllocSkuId] = useState("");
  const [allocQty, setAllocQty] = useState("");
  const [allocDir, setAllocDir] = useState<"IN" | "OUT">("IN");
  const [reason, setReason] = useState("");

  const [xferFrom, setXferFrom] = useState("");
  const [xferTo, setXferTo] = useState("");
  const [xferSkuId, setXferSkuId] = useState("");
  const [xferQty, setXferQty] = useState("");
  const [xferContent, setXferContent] = useState("");

  const [countNote, setCountNote] = useState("");
  const [countQtyBySku, setCountQtyBySku] = useState<Record<string, string>>({});

  const pool = useMemo(
    () => accounts.find((a) => a.kind === "ADMIN_POOL") ?? null,
    [accounts],
  );
  const staffAccounts = useMemo(
    () => accounts.filter((a) => a.kind === "STAFF"),
    [accounts],
  );
  const staffWithoutAccount = useMemo(() => {
    const have = new Set(staffAccounts.map((a) => a.staffId).filter(Boolean));
    return staffOptions.filter((s) => !have.has(s.id));
  }, [staffAccounts, staffOptions]);

  const accountStock = useMemo(
    () => (selectedId ? stock.filter((s) => s.accountId === selectedId) : stock),
    [stock, selectedId],
  );

  function reload(accountId?: string | null) {
    const id = accountId === undefined ? selectedId : accountId;
    if (accountId !== undefined) setSelectedId(accountId);
    startTransition(async () => {
      setError(null);
      const [accRes, stockRes, ledRes, countRes] = await Promise.all([
        refreshEmployeeGoldAccounts(),
        refreshEmployeeGoldStock(id),
        refreshEmployeeGoldLedger({ accountId: id }),
        refreshEmployeeGoldCounts({ accountId: id }),
      ]);
      if (!accRes.ok) {
        setError(formatActionError(accRes.message));
        return;
      }
      if (!stockRes.ok) {
        setError(formatActionError(stockRes.message));
        return;
      }
      if (!ledRes.ok) {
        setError(formatActionError(ledRes.message));
        return;
      }
      if (!countRes.ok) {
        setError(formatActionError(countRes.message));
        return;
      }
      setAccounts(accRes.data);
      setStock(stockRes.data);
      setLedger(ledRes.data);
      setCounts(countRes.data);
    });
  }

  function onSelectAccount(id: string) {
    setSelectedId(id);
    reload(id);
  }

  function onSearchSku() {
    startTransition(async () => {
      setError(null);
      const res = await searchGoldSkuOptions(skuQuery);
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setSkuOptions(res.data);
    });
  }

  function onCreateAccount() {
    if (!canMutate || !staffId) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await createStaffGoldAccount({ staffId });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã tạo tài khoản ${res.data.code}.`);
      setStaffId("");
      reload(null);
    });
  }

  function onCapital() {
    if (!canMutate || !capitalSkuId) return;
    const qty = Math.trunc(Number(capitalQty));
    if (!Number.isFinite(qty) || qty <= 0) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await adminCapitalGold({
        skuId: capitalSkuId,
        direction: capitalDir,
        quantity: qty,
        content: capitalDir === "IN" ? "Nạp vàng Quỹ Admin" : "Rút vàng Quỹ Admin",
        reason,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice("Đã cập nhật vốn vàng Quỹ Admin.");
      setCapitalQty("");
      reload(pool?.id ?? null);
    });
  }

  function onAllocate() {
    if (!canMutate || !allocAccountId || !allocSkuId) return;
    const qty = Math.trunc(Number(allocQty));
    if (!Number.isFinite(qty) || qty <= 0) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await adminAllocateGold({
        staffAccountId: allocAccountId,
        skuId: allocSkuId,
        direction: allocDir,
        quantity: qty,
        content:
          allocDir === "IN"
            ? "Admin phân bổ vàng cho nhân viên"
            : "Admin thu hồi vàng từ nhân viên",
        reason,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice("Đã ghi phân bổ vàng đối ứng hai tài khoản.");
      setAllocQty("");
      reload(allocAccountId);
    });
  }

  function onTransfer() {
    if (!canTransfer || !xferFrom || !xferTo || !xferSkuId) return;
    const qty = Math.trunc(Number(xferQty));
    if (!Number.isFinite(qty) || qty <= 0) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await transferEmployeeGold({
        fromAccountId: xferFrom,
        toAccountId: xferTo,
        skuId: xferSkuId,
        quantity: qty,
        content: xferContent,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã chuyển vàng ${res.data.code}.`);
      setXferQty("");
      setXferContent("");
      reload(xferFrom);
    });
  }

  function onSubmitCount() {
    if (!selectedId || !canTransfer) return;
    const lines = accountStock
      .map((s) => {
        const raw = countQtyBySku[s.skuId];
        if (raw === undefined || raw === "") return null;
        const countedQty = Math.trunc(Number(raw));
        if (!Number.isFinite(countedQty) || countedQty < 0) return null;
        return { skuId: s.skuId, countedQty };
      })
      .filter((x): x is { skuId: string; countedQty: number } => x !== null);
    if (!lines.length) {
      setError("Nhập số lượng kiểm kê cho ít nhất một SKU.");
      return;
    }
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await submitGoldCount({
        accountId: selectedId,
        note: countNote,
        lines,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã ghi kiểm kê ${res.data.code} (không đổi tồn Quỹ vàng).`);
      setCountQtyBySku({});
      setCountNote("");
      reload(selectedId);
    });
  }

  const skuSelectOptions = useMemo(() => {
    const map = new Map<string, GoldSkuOption>();
    for (const s of skuOptions) map.set(s.skuId, s);
    for (const s of stock) {
      if (!map.has(s.skuId)) {
        map.set(s.skuId, {
          skuId: s.skuId,
          skuCode: s.skuCode,
          skuName: s.skuName,
          storeQuantity: s.storeQuantity,
        });
      }
    }
    return Array.from(map.values());
  }, [skuOptions, stock]);

  return (
    <div className={`space-y-5 ${pending ? "opacity-70" : ""}`}>
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--tlkv-faint)] uppercase">
          Quỹ vàng
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Tài khoản Quỹ vàng nhân viên
        </h1>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-6 text-[var(--tlkv-muted)]">
          Custody theo dõi vàng phân bổ trên tồn cửa hàng. Kiểm kê chỉ ghi nhận, không tự đổi số
          dư. Chuyển vàng (CTCV) cập nhật ngay hai tài khoản.
        </p>
        {pool ? (
          <p className="mt-3 text-[14px] font-semibold">Quỹ Admin vàng: {pool.code}</p>
        ) : null}
      </section>

      {error ? <p className="text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}
      {notice ? (
        <p className="rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[13px]">{notice}</p>
      ) : null}

      {canMutate ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <h2 className="text-[14px] font-semibold">Tạo tài khoản NV</h2>
            <select
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">Chọn nhân viên…</option>
              {staffWithoutAccount.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} · {s.email}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!staffId || pending}
              onClick={onCreateAccount}
              className="mt-3 h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Tạo Quỹ vàng
            </button>
          </div>

          <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <h2 className="text-[14px] font-semibold">Nạp / rút vàng Quỹ Admin</h2>
            <div className="mt-3 flex gap-2">
              <input
                className="h-10 flex-1 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                placeholder="Tìm SKU…"
                value={skuQuery}
                onChange={(e) => setSkuQuery(e.target.value)}
              />
              <button
                type="button"
                onClick={onSearchSku}
                className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium"
              >
                Tìm
              </button>
            </div>
            <select
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              value={capitalSkuId}
              onChange={(e) => setCapitalSkuId(e.target.value)}
            >
              <option value="">Chọn SKU…</option>
              {skuSelectOptions.map((s) => (
                <option key={s.skuId} value={s.skuId}>
                  {s.skuCode} · {s.skuName} (kho {s.storeQuantity})
                </option>
              ))}
            </select>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={`h-9 flex-1 rounded-lg border text-[12px] font-semibold ${
                  capitalDir === "IN"
                    ? "border-[var(--tlkv-red)] bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                    : "border-[var(--tlkv-line)]"
                }`}
                onClick={() => setCapitalDir("IN")}
              >
                Nạp
              </button>
              <button
                type="button"
                className={`h-9 flex-1 rounded-lg border text-[12px] font-semibold ${
                  capitalDir === "OUT"
                    ? "border-[var(--tlkv-red)] bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                    : "border-[var(--tlkv-line)]"
                }`}
                onClick={() => setCapitalDir("OUT")}
              >
                Rút
              </button>
            </div>
            <input
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              inputMode="numeric"
              placeholder="Số lượng"
              value={capitalQty}
              onChange={(e) => setCapitalQty(e.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              type="button"
              disabled={!capitalSkuId || !capitalQty || pending}
              onClick={onCapital}
              className="mt-3 h-10 w-full rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Ghi nhận
            </button>
          </div>

          <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <h2 className="text-[14px] font-semibold">Phân bổ / thu hồi NV</h2>
            <select
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              value={allocAccountId}
              onChange={(e) => setAllocAccountId(e.target.value)}
            >
              <option value="">Chọn Quỹ NV…</option>
              {staffAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.staffName || a.name}
                </option>
              ))}
            </select>
            <select
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              value={allocSkuId}
              onChange={(e) => setAllocSkuId(e.target.value)}
            >
              <option value="">Chọn SKU…</option>
              {skuSelectOptions.map((s) => (
                <option key={`alloc-${s.skuId}`} value={s.skuId}>
                  {s.skuCode} · {s.skuName}
                </option>
              ))}
            </select>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={`h-9 flex-1 rounded-lg border text-[12px] font-semibold ${
                  allocDir === "IN"
                    ? "border-[var(--tlkv-red)] bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                    : "border-[var(--tlkv-line)]"
                }`}
                onClick={() => setAllocDir("IN")}
              >
                Cộng NV
              </button>
              <button
                type="button"
                className={`h-9 flex-1 rounded-lg border text-[12px] font-semibold ${
                  allocDir === "OUT"
                    ? "border-[var(--tlkv-red)] bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                    : "border-[var(--tlkv-line)]"
                }`}
                onClick={() => setAllocDir("OUT")}
              >
                Trừ NV
              </button>
            </div>
            <input
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              inputMode="numeric"
              placeholder="Số lượng"
              value={allocQty}
              onChange={(e) => setAllocQty(e.target.value.replace(/[^\d]/g, ""))}
            />
            <input
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              placeholder="Lý do (tuỳ chọn)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              disabled={!allocAccountId || !allocSkuId || !allocQty || pending}
              onClick={onAllocate}
              className="mt-3 h-10 w-full rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Phân bổ đối ứng
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
          <h2 className="text-[14px] font-semibold">Tài khoản</h2>
          <ul className="mt-3 space-y-1">
            {accounts.map((a) => {
              const active = a.id === selectedId;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelectAccount(a.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left ${
                      active
                        ? "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                        : "hover:bg-[var(--tlkv-bg)]"
                    }`}
                  >
                    <p className="text-[13px] font-semibold">{a.code}</p>
                    <p className="text-[12px] text-[var(--tlkv-muted)]">
                      {a.kind === "ADMIN_POOL" ? "Quỹ Admin" : a.staffName || a.name}
                    </p>
                  </button>
                </li>
              );
            })}
            {accounts.length === 0 ? (
              <li className="py-6 text-center text-[13px] text-[var(--tlkv-muted)]">
                Chưa có tài khoản
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--tlkv-line)] pb-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`h-9 rounded-lg px-3 text-[12px] font-semibold ${
                  tab === t.id
                    ? "bg-[var(--tlkv-red)] text-white"
                    : "border border-[var(--tlkv-line)] hover:bg-[var(--tlkv-bg)]"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => reload(selectedId)}
              className="ml-auto h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium"
            >
              Làm mới
            </button>
          </div>

          {tab === "stock" ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-[12px] text-[var(--tlkv-muted)]">
                  <tr className="border-b border-[var(--tlkv-line)]">
                    <th className="py-2 pr-3 font-medium">SKU</th>
                    <th className="py-2 pr-3 font-medium">Tên</th>
                    <th className="py-2 pr-3 font-medium">Quỹ vàng</th>
                    <th className="py-2 font-medium">Tồn cửa hàng</th>
                  </tr>
                </thead>
                <tbody>
                  {accountStock.map((row) => (
                    <tr key={`${row.accountId}-${row.skuId}`} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2.5 pr-3 font-medium">{row.skuCode}</td>
                      <td className="py-2.5 pr-3">{row.skuName}</td>
                      <td className="py-2.5 pr-3 font-semibold">{row.quantity}</td>
                      <td className="py-2.5 text-[var(--tlkv-muted)]">{row.storeQuantity}</td>
                    </tr>
                  ))}
                  {accountStock.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-[var(--tlkv-muted)]">
                        Chưa có tồn vàng trên quỹ này
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "count" ? (
            <div className="mt-3 space-y-4">
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                Kiểm kê chỉ ghi nhận chênh lệch — không tự điều chỉnh số dư Quỹ vàng.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="text-[12px] text-[var(--tlkv-muted)]">
                    <tr className="border-b border-[var(--tlkv-line)]">
                      <th className="py-2 pr-3 font-medium">SKU</th>
                      <th className="py-2 pr-3 font-medium">Hệ thống</th>
                      <th className="py-2 font-medium">Đếm thực tế</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountStock.map((row) => (
                      <tr key={`c-${row.skuId}`} className="border-b border-[var(--tlkv-line)]">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium">{row.skuCode}</p>
                          <p className="text-[12px] text-[var(--tlkv-muted)]">{row.skuName}</p>
                        </td>
                        <td className="py-2.5 pr-3">{row.quantity}</td>
                        <td className="py-2.5">
                          <input
                            className="h-9 w-28 rounded-lg border border-[var(--tlkv-line)] px-2 text-[13px]"
                            inputMode="numeric"
                            value={countQtyBySku[row.skuId] ?? ""}
                            onChange={(e) =>
                              setCountQtyBySku((prev) => ({
                                ...prev,
                                [row.skuId]: e.target.value.replace(/[^\d]/g, ""),
                              }))
                            }
                            disabled={!canTransfer}
                          />
                        </td>
                      </tr>
                    ))}
                    {accountStock.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-[var(--tlkv-muted)]">
                          Không có SKU để kiểm kê trên quỹ đã chọn
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <input
                className="h-10 w-full max-w-md rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                placeholder="Ghi chú kiểm kê (tuỳ chọn)"
                value={countNote}
                onChange={(e) => setCountNote(e.target.value)}
                disabled={!canTransfer}
              />
              <button
                type="button"
                disabled={!canTransfer || !selectedId || pending || accountStock.length === 0}
                onClick={onSubmitCount}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                Ghi kiểm kê
              </button>

              <div>
                <h3 className="text-[13px] font-semibold">Lịch sử kiểm kê</h3>
                <ul className="mt-2 space-y-2">
                  {counts.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg border border-[var(--tlkv-line)] px-3 py-2 text-[13px]"
                    >
                      <p className="font-semibold">
                        {c.code} · {formatWhen(c.countedAt)}
                      </p>
                      <p className="text-[12px] text-[var(--tlkv-muted)]">
                        {c.accountCode} · {c.countedByEmail}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                      <p className="mt-1 text-[12px]">
                        {c.lines
                          .map(
                            (l) =>
                              `${l.skuCode}: HT ${l.systemQty} / Đếm ${l.countedQty} (Δ ${l.diffQty})`,
                          )
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                  {counts.length === 0 ? (
                    <li className="py-4 text-[13px] text-[var(--tlkv-muted)]">Chưa có phiếu kiểm kê</li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}

          {tab === "ledger" ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-[13px]">
                <thead className="text-[12px] text-[var(--tlkv-muted)]">
                  <tr className="border-b border-[var(--tlkv-line)]">
                    <th className="py-2 pr-3 font-medium">Thời gian</th>
                    <th className="py-2 pr-3 font-medium">SKU</th>
                    <th className="py-2 pr-3 font-medium">Loại</th>
                    <th className="py-2 pr-3 font-medium">Chiều</th>
                    <th className="py-2 pr-3 font-medium">SL</th>
                    <th className="py-2 pr-3 font-medium">Sau</th>
                    <th className="py-2 pr-3 font-medium">Nội dung</th>
                    <th className="py-2 font-medium">Người làm</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.items.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {formatWhen(row.occurredAt)}
                      </td>
                      <td className="py-2.5 pr-3">{row.skuCode}</td>
                      <td className="py-2.5 pr-3">{TXN_LABEL[row.txnType] || row.txnType}</td>
                      <td className="py-2.5 pr-3">{row.direction === "IN" ? "Nhập" : "Xuất"}</td>
                      <td className="py-2.5 pr-3 font-medium">{row.quantity}</td>
                      <td className="py-2.5 pr-3">{row.qtyAfter}</td>
                      <td className="py-2.5 pr-3">{row.content}</td>
                      <td className="py-2.5 text-[12px] text-[var(--tlkv-muted)]">
                        {row.actorEmail}
                      </td>
                    </tr>
                  ))}
                  {ledger.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-[var(--tlkv-muted)]">
                        Chưa có biến động
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === "transfer" ? (
            <div className="mt-3 max-w-lg space-y-3">
              <p className="text-[12px] text-[var(--tlkv-muted)]">
                Chuyển vàng giữa hai Quỹ vàng nhân viên — chứng từ CTCV, cập nhật tồn ngay.
              </p>
              <select
                className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                value={xferFrom}
                onChange={(e) => setXferFrom(e.target.value)}
                disabled={!canTransfer}
              >
                <option value="">Từ tài khoản…</option>
                {staffAccounts.map((a) => (
                  <option key={`from-${a.id}`} value={a.id}>
                    {a.code} · {a.staffName || a.name}
                  </option>
                ))}
              </select>
              <select
                className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                value={xferTo}
                onChange={(e) => setXferTo(e.target.value)}
                disabled={!canTransfer}
              >
                <option value="">Đến tài khoản…</option>
                {staffAccounts
                  .filter((a) => a.id !== xferFrom)
                  .map((a) => (
                    <option key={`to-${a.id}`} value={a.id}>
                      {a.code} · {a.staffName || a.name}
                    </option>
                  ))}
              </select>
              <select
                className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                value={xferSkuId}
                onChange={(e) => setXferSkuId(e.target.value)}
                disabled={!canTransfer}
              >
                <option value="">SKU…</option>
                {(xferFrom
                  ? stock.filter((s) => s.accountId === xferFrom)
                  : stock
                ).map((s) => (
                  <option key={`xsku-${s.accountId}-${s.skuId}`} value={s.skuId}>
                    {s.skuCode} · tồn quỹ {s.quantity}
                  </option>
                ))}
              </select>
              <input
                className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                inputMode="numeric"
                placeholder="Số lượng"
                value={xferQty}
                onChange={(e) => setXferQty(e.target.value.replace(/[^\d]/g, ""))}
                disabled={!canTransfer}
              />
              <input
                className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                placeholder="Nội dung chuyển"
                value={xferContent}
                onChange={(e) => setXferContent(e.target.value)}
                disabled={!canTransfer}
              />
              <button
                type="button"
                disabled={
                  !canTransfer ||
                  !xferFrom ||
                  !xferTo ||
                  !xferSkuId ||
                  !xferQty ||
                  !xferContent.trim() ||
                  pending
                }
                onClick={onTransfer}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                Chuyển vàng (CTCV)
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
