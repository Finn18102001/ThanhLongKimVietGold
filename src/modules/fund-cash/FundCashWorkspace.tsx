"use client";

import { useMemo, useState, useTransition } from "react";
import { formatDong } from "@/shared/lib/money";
import { DongNumberInput } from "@/shared/ui/DongInput";
import { formatActionError } from "@/shared/lib/action-result";
import {
  adminAllocateCash,
  adminCapitalCash,
  createStaffCashAccount,
  refreshEmployeeCashAccounts,
  refreshEmployeeCashLedger,
} from "./actions";
import { CashRequestPanel } from "./CashRequestPanel";
import { CashTransferPanel } from "./CashTransferPanel";
import { formatMoneyKind } from "./money-kind";
import type {
  CashRequestListPage,
  CashTransferListPage,
  EmployeeCashAccount,
  EmployeeCashLedgerPage,
  EmployeeCashMoneyKind,
} from "./types";

type StaffOption = { id: string; fullName: string; email: string };

const TXN_LABEL: Record<string, string> = {
  ADMIN_CAPITAL_IN: "Nạp vốn Admin",
  ADMIN_CAPITAL_OUT: "Rút vốn Admin",
  ADMIN_ALLOCATE: "Phân bổ Admin",
  SALE_RECEIPT: "Thu bán hàng",
  PURCHASE_PAY: "Chi mua hàng",
  TRANSFER: "Chuyển quỹ",
  VOID_REVERSAL: "Đảo hủy",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

export function FundCashWorkspace({
  initialAccounts,
  initialLedger,
  initialTransfers,
  initialRequests,
  canMutate,
  canTransfer,
  staffOptions,
}: {
  initialAccounts: EmployeeCashAccount[];
  initialLedger: EmployeeCashLedgerPage;
  initialTransfers: CashTransferListPage;
  initialRequests: CashRequestListPage;
  canMutate: boolean;
  canTransfer: boolean;
  staffOptions: StaffOption[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [ledger, setLedger] = useState(initialLedger);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAccounts[0]?.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [staffId, setStaffId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [capitalDong, setCapitalDong] = useState<number | null>(null);
  const [capitalDir, setCapitalDir] = useState<"IN" | "OUT">("IN");
  const [capitalKind, setCapitalKind] = useState<EmployeeCashMoneyKind>("CASH");
  const [allocDong, setAllocDong] = useState<number | null>(null);
  const [allocDir, setAllocDir] = useState<"IN" | "OUT">("IN");
  const [allocKind, setAllocKind] = useState<EmployeeCashMoneyKind>("CASH");
  const [allocAccountId, setAllocAccountId] = useState("");
  const [reason, setReason] = useState("");

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

  function reload(accountId?: string | null) {
    startTransition(async () => {
      setError(null);
      const [accRes, ledRes] = await Promise.all([
        refreshEmployeeCashAccounts(),
        refreshEmployeeCashLedger({ accountId: accountId ?? selectedId }),
      ]);
      if (!accRes.ok) {
        setError(formatActionError(accRes.message));
        return;
      }
      if (!ledRes.ok) {
        setError(formatActionError(ledRes.message));
        return;
      }
      setAccounts(accRes.data);
      setLedger(ledRes.data);
    });
  }

  function onSelectAccount(id: string) {
    setSelectedId(id);
    reload(id);
  }

  function onCreateAccount() {
    if (!canMutate || !staffId) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const staff = staffOptions.find((s) => s.id === staffId);
      const defaultTestName = staff
        ? `${staff.fullName} tài khoản quỹ tiền test`
        : "Tài khoản quỹ tiền test";
      const res = await createStaffCashAccount({
        staffId,
        name: accountName.trim() || defaultTestName,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setAccountName("");
      setNotice(`Đã tạo tài khoản ${res.data.code}.`);
      setStaffId("");
      reload(null);
    });
  }

  function onCapital() {
    if (!canMutate || !capitalDong || capitalDong <= 0) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await adminCapitalCash({
        direction: capitalDir,
        amountDong: capitalDong,
        content: capitalDir === "IN" ? "Nạp vốn Quỹ Admin" : "Rút vốn Quỹ Admin",
        reason,
        moneyKind: capitalKind,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã cập nhật vốn Quỹ Admin (${formatMoneyKind(capitalKind)}).`);
      setCapitalDong(null);
      reload(pool?.id ?? null);
    });
  }

  function onAllocate() {
    if (!canMutate || !allocAccountId || !allocDong || allocDong <= 0) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await adminAllocateCash({
        staffAccountId: allocAccountId,
        direction: allocDir,
        amountDong: allocDong,
        content:
          allocDir === "IN"
            ? "Admin phân bổ tiền cho nhân viên"
            : "Admin thu hồi tiền từ nhân viên",
        reason,
        moneyKind: allocKind,
      });
      if (!res.ok) {
        setError(formatActionError(res.message));
        return;
      }
      setNotice(`Đã ghi phân bổ đối ứng (${formatMoneyKind(allocKind)}).`);
      setAllocDong(null);
      reload(allocAccountId);
    });
  }

  return (
    <div className={`space-y-5 ${pending ? "opacity-70" : ""}`}>
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--tlkv-faint)] uppercase">
          Quỹ tiền
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tài khoản Quỹ tiền nhân viên</h1>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-6 text-[var(--tlkv-muted)]">
          Mỗi quỹ quản lý riêng tiền mặt và chuyển khoản. Xác nhận YC thu/chi ± đúng loại theo hình
          thức thanh toán trên hóa đơn. Nhân viên không tự cộng/trừ.
        </p>
        {pool ? (
          <div className="mt-3 space-y-1 text-[14px]">
            <p className="font-semibold">
              Quỹ Admin ({pool.code}): {formatDong(pool.balanceDong)}
            </p>
            <p className="text-[12px] text-[var(--tlkv-muted)]">
              TM {formatDong(pool.cashBalanceDong)} · CK {formatDong(pool.bankBalanceDong)}
            </p>
          </div>
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
              onChange={(e) => {
                setStaffId(e.target.value);
                const s = staffOptions.find((x) => x.id === e.target.value);
                if (s) setAccountName(`${s.fullName} tài khoản quỹ tiền test`);
              }}
            >
              <option value="">Chọn nhân viên…</option>
              {staffWithoutAccount.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} · {s.email}
                </option>
              ))}
            </select>
            <input
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              placeholder="Tên TK — hard-test thêm chữ «test»"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
              Ví dụ: Dương tài khoản quỹ tiền test — dễ lọc / ẩn sau round UI.
            </p>
            <button
              type="button"
              disabled={!staffId || pending}
              onClick={onCreateAccount}
              className="mt-3 h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Tạo Quỹ tiền
            </button>
          </div>

          <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
            <h2 className="text-[14px] font-semibold">Nạp / rút vốn Quỹ Admin</h2>
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
            <select
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              value={capitalKind}
              onChange={(e) => setCapitalKind(e.target.value === "BANK" ? "BANK" : "CASH")}
            >
              <option value="CASH">Tiền mặt</option>
              <option value="BANK">Chuyển khoản</option>
            </select>
            <div className="mt-3">
              <DongNumberInput
                value={capitalDong}
                onValueChange={setCapitalDong}
                className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              />
            </div>
            <button
              type="button"
              disabled={!capitalDong || capitalDong <= 0 || pending}
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
                  {a.code} · {a.name}
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
            <select
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              value={allocKind}
              onChange={(e) => setAllocKind(e.target.value === "BANK" ? "BANK" : "CASH")}
            >
              <option value="CASH">Tiền mặt</option>
              <option value="BANK">Chuyển khoản</option>
            </select>
            <div className="mt-3">
              <DongNumberInput
                value={allocDong}
                onValueChange={setAllocDong}
                className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              />
            </div>
            <input
              className="mt-3 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              placeholder="Lý do (tuỳ chọn)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              disabled={!allocAccountId || !allocDong || allocDong <= 0 || pending}
              onClick={onAllocate}
              className="mt-3 h-10 w-full rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Phân bổ đối ứng
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
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
                      {a.kind === "ADMIN_POOL" ? "Quỹ Admin" : a.name}
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold">{formatDong(a.balanceDong)}</p>
                    <p className="text-[11px] text-[var(--tlkv-faint)]">
                      TM {formatDong(a.cashBalanceDong)} · CK {formatDong(a.bankBalanceDong)}
                    </p>
                  </button>
                </li>
              );
            })}
            {accounts.length === 0 ? (
              <li className="py-6 text-center text-[13px] text-[var(--tlkv-muted)]">Chưa có tài khoản</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-semibold">Lịch sử biến động</h2>
            <button
              type="button"
              onClick={() => reload(selectedId)}
              className="h-9 rounded-lg border border-[var(--tlkv-line)] px-3 text-[12px] font-medium"
            >
              Làm mới
            </button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-[12px] text-[var(--tlkv-muted)]">
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className="py-2 pr-3 font-medium">Thời gian</th>
                  <th className="py-2 pr-3 font-medium">Loại</th>
                  <th className="py-2 pr-3 font-medium">Chiều</th>
                  <th className="py-2 pr-3 font-medium">TM/CK</th>
                  <th className="py-2 pr-3 font-medium">Số tiền</th>
                  <th className="py-2 pr-3 font-medium">Sau</th>
                  <th className="py-2 pr-3 font-medium">Nội dung</th>
                  <th className="py-2 font-medium">Người làm</th>
                </tr>
              </thead>
              <tbody>
                {ledger.items.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                    <td className="py-2.5 pr-3 whitespace-nowrap">{formatWhen(row.occurredAt)}</td>
                    <td className="py-2.5 pr-3">{TXN_LABEL[row.txnType] || row.txnType}</td>
                    <td className="py-2.5 pr-3">{row.direction === "IN" ? "Thu" : "Chi"}</td>
                    <td className="py-2.5 pr-3">{formatMoneyKind(row.moneyKind)}</td>
                    <td className="py-2.5 pr-3 font-medium">{formatDong(row.amountDong)}</td>
                    <td className="py-2.5 pr-3">{formatDong(row.balanceAfterDong)}</td>
                    <td className="py-2.5 pr-3">{row.content}</td>
                    <td className="py-2.5 text-[12px] text-[var(--tlkv-muted)]">{row.actorEmail}</td>
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
        </div>
      </section>

      <CashRequestPanel
        initialRequests={initialRequests}
        canMutateQueue={canTransfer}
        canAdminSeed={canMutate}
        onBalancesChanged={() => reload(selectedId)}
      />

      <CashTransferPanel
        staffAccounts={staffAccounts}
        initialTransfers={initialTransfers}
        canCreate={canTransfer}
        onBalancesChanged={() => reload(selectedId)}
      />
    </div>
  );
}
