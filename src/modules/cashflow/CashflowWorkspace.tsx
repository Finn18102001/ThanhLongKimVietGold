"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  ArrowsLeftRight,
  Bank,
  MagnifyingGlass,
  Minus,
  Money,
  Plus,
  Wallet,
} from "@phosphor-icons/react";
import { formatDong } from "@/shared/lib/money";
import {
  depositCash,
  fetchCapitalSnapshot,
  fetchCashflowOverview,
  fetchCashLedger,
  transferCash,
  withdrawCash,
} from "./actions";
import type {
  CapitalSnapshot,
  CashAccountCard,
  CashflowOverview,
  CashLedgerPage,
  CashTxnType,
} from "./types";
import { TXN_TYPE_LABEL } from "./types";

type ModalKind = "deposit" | "withdraw" | "transfer" | null;

const TXN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tất cả loại" },
  { value: "SALE_PAYMENT", label: "Thu bán hàng" },
  { value: "SALE_VOID_REFUND", label: "Hủy HĐ — hoàn tiền" },
  { value: "PURCHASE_PAYMENT", label: "Chi mua hàng" },
  { value: "RECEIVABLE_COLLECTION", label: "Thu công nợ" },
  { value: "PAYABLE_PAYMENT", label: "Chi trả nợ" },
  { value: "OTHER_INCOME", label: "Thu khác" },
  { value: "OTHER_EXPENSE", label: "Chi khác" },
  { value: "TRANSFER", label: "Chuyển quỹ" },
];

function txnTone(type: CashTxnType): string {
  if (type === "SALE_PAYMENT" || type === "RECEIVABLE_COLLECTION" || type === "OTHER_INCOME") {
    return "bg-[var(--tlkv-green-soft)] text-[var(--tlkv-green)]";
  }
  if (
    type === "PURCHASE_PAYMENT" ||
    type === "PAYABLE_PAYMENT" ||
    type === "OTHER_EXPENSE" ||
    type === "SALE_VOID_REFUND"
  ) {
    return "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]";
  }
  return "bg-[var(--tlkv-violet-soft)] text-[var(--tlkv-violet)]";
}

export function CashflowWorkspace({
  initialOverview,
  initialLedger,
  initialCapital,
  initialFrom,
  initialTo,
}: {
  initialOverview: CashflowOverview;
  initialLedger: CashLedgerPage;
  initialCapital: CapitalSnapshot;
  initialFrom: string;
  initialTo: string;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [ledger, setLedger] = useState(initialLedger);
  const [capital, setCapital] = useState(initialCapital);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [accountId, setAccountId] = useState("");
  const [txnType, setTxnType] = useState("");
  const [direction, setDirection] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalKind>(null);

  const accounts = useMemo(
    () => [overview.cash, overview.bank].filter(Boolean) as CashAccountCard[],
    [overview.cash, overview.bank],
  );

  function refreshAll(nextFrom = from, nextTo = to) {
    startTransition(async () => {
      try {
        const [nextOverview, nextLedger, nextCapital] = await Promise.all([
          fetchCashflowOverview(),
          fetchCashLedger({
            from: nextFrom,
            to: nextTo,
            accountId: accountId || null,
            txnType: txnType || null,
            direction: direction || null,
            q: q || null,
          }),
          fetchCapitalSnapshot(),
        ]);
        setOverview(nextOverview);
        setLedger(nextLedger);
        setCapital(nextCapital);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được dòng tiền");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Quản lý dòng tiền</h1>
          <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
            Theo dõi tiền mặt, ngân hàng, thu/chi và vốn hàng hóa. Số liệu lấy từ giao dịch thực tế.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModal("deposit")}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--tlkv-red)] px-3 text-[13px] font-semibold text-white"
          >
            <Plus size={14} weight="bold" />
            Nạp tiền
          </button>
          <button
            type="button"
            onClick={() => setModal("withdraw")}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-semibold"
          >
            <Minus size={14} weight="bold" />
            Rút tiền
          </button>
          <button
            type="button"
            onClick={() => setModal("transfer")}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-semibold"
          >
            <ArrowsLeftRight size={14} weight="bold" />
            Chuyển tiền
          </button>
        </div>
      </div>

      {error ? <p className="text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {overview.cash ? <AccountCard account={overview.cash} icon="cash" /> : null}
        {overview.bank ? <AccountCard account={overview.bank} icon="bank" /> : null}
        <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] text-[var(--tlkv-muted)]">Tổng tiền hiện có</p>
              <p className="mt-2 text-[26px] font-bold tracking-tight text-[var(--tlkv-red)]">
                {formatDong(overview.availableDong)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]">
              <Wallet size={20} weight="bold" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
            <Stat label="Tổng thu (7 ngày)" value={formatDong(overview.sevenDay.inDong)} tone="in" />
            <Stat label="Tổng chi (7 ngày)" value={formatDong(overview.sevenDay.outDong)} tone="out" />
            <Stat
              label="Dòng tiền ròng"
              value={formatDong(overview.sevenDay.netDong)}
              tone={overview.sevenDay.netDong >= 0 ? "in" : "out"}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--tlkv-line)] pt-3 text-[12px]">
            <Stat label="Phải thu" value={formatDong(overview.receivableDong)} />
            <Stat label="Phải trả" value={formatDong(overview.payableDong)} />
          </div>
        </article>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Lịch sử giao dịch</h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Tất cả tài khoản</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={txnType}
              onChange={(e) => setTxnType(e.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              {TXN_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            >
              <option value="">Thu / Chi</option>
              <option value="IN">Thu</option>
              <option value="OUT">Chi</option>
            </select>
            <label className="relative">
              <MagnifyingGlass
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--tlkv-faint)]"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm nội dung, mã, nhân viên..."
                className="h-10 w-[220px] rounded-lg border border-[var(--tlkv-line)] pr-3 pl-9 text-[13px]"
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() => refreshAll()}
              className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              Lọc
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MiniKpi label="Tổng thu" value={formatDong(ledger.sumInDong)} />
          <MiniKpi label="Tổng chi" value={formatDong(ledger.sumOutDong)} />
          <MiniKpi label="Dòng tiền ròng" value={formatDong(ledger.netDong)} />
        </div>

        <div className={`mt-4 overflow-x-auto ${pending ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className="text-[12px] text-[var(--tlkv-muted)]">
              <tr className="border-b border-[var(--tlkv-line)]">
                <th className="py-2 font-medium">Thời gian</th>
                <th className="py-2 font-medium">Loại giao dịch</th>
                <th className="py-2 font-medium">Nội dung</th>
                <th className="py-2 font-medium">Tài khoản</th>
                <th className="py-2 text-right font-medium">Thu</th>
                <th className="py-2 text-right font-medium">Chi</th>
                <th className="py-2 text-right font-medium">Số dư sau</th>
                <th className="py-2 font-medium">Tham chiếu</th>
                <th className="py-2 font-medium">Nhân viên</th>
              </tr>
            </thead>
            <tbody>
              {ledger.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-[var(--tlkv-muted)]">
                    Chưa có giao dịch trong khoảng lọc.
                  </td>
                </tr>
              ) : (
                ledger.items.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--tlkv-line)]">
                    <td className="py-2.5 whitespace-nowrap tabular-nums">
                      {formatDateTime(row.occurredAt)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${txnTone(row.txnType)}`}
                      >
                        {TXN_TYPE_LABEL[row.txnType] ?? row.txnType}
                      </span>
                    </td>
                    <td className="py-2.5 max-w-[240px]">{row.content}</td>
                    <td className="py-2.5">{row.accountName}</td>
                    <td className="py-2.5 text-right tabular-nums text-[var(--tlkv-green)]">
                      {row.direction === "IN" && row.txnType !== "TRANSFER"
                        ? `+${formatDong(row.amountDong)}`
                        : row.direction === "IN"
                          ? formatDong(row.amountDong)
                          : ""}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-[var(--tlkv-red)]">
                      {row.direction === "OUT" ? `-${formatDong(row.amountDong)}` : ""}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">
                      {formatDong(row.balanceAfterDong)}
                    </td>
                    <td className="py-2.5 font-mono text-[12px]">{row.referenceCode ?? "-"}</td>
                    <td className="py-2.5">{row.actorEmail.split("@")[0] ?? row.actorEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-[var(--tlkv-muted)]">
          Hiển thị {ledger.items.length}/{ledger.total} giao dịch. Chuyển tiền nội bộ không tính vào
          tổng thu/chi.
        </p>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <h2 className="text-[15px] font-semibold">Vốn hàng hóa</h2>
        <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
          Tổng vốn tồn kho theo giá vốn nhập thực tế (không dùng giá bán).
        </p>
        <p className="mt-3 text-[22px] font-bold">{formatDong(capital.totalDong)}</p>
        <div className="mt-4 space-y-3">
          {capital.groups.length === 0 ? (
            <p className="text-[13px] text-[var(--tlkv-muted)]">Chưa có tồn kho có giá vốn.</p>
          ) : (
            capital.groups.map((group) => (
              <div key={group.groupName}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span>{group.groupName}</span>
                  <span className="tabular-nums font-medium">
                    {formatDong(group.capitalDong)} ({group.sharePercent}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--tlkv-bg)]">
                  <div
                    className="h-full rounded-full bg-[var(--tlkv-red)]"
                    style={{ width: `${Math.min(100, Math.max(0, group.sharePercent))}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {modal ? (
        <CashActionModal
          kind={modal}
          accounts={accounts}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            refreshAll();
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function AccountCard({
  account,
  icon,
}: {
  account: CashAccountCard;
  icon: "cash" | "bank";
}) {
  const Icon = icon === "cash" ? Money : Bank;
  return (
    <article className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[var(--tlkv-bg)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[var(--tlkv-muted)]">
              {account.accountType}
            </span>
            <span className="font-mono text-[11px] text-[var(--tlkv-faint)]">{account.code}</span>
          </div>
          <p className="mt-2 text-[15px] font-semibold">{account.name}</p>
          <p className="mt-2 text-[26px] font-bold tracking-tight">{formatDong(account.balanceDong)}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--tlkv-amber-soft)] text-[var(--tlkv-amber)]">
          <Icon size={20} weight="bold" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        <Stat label="Thu hôm nay" value={`+${formatDong(account.inTodayDong)}`} tone="in" />
        <Stat label="Chi hôm nay" value={`-${formatDong(account.outTodayDong)}`} tone="out" />
        <Stat label="GD hôm nay" value={String(account.txnToday)} />
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "in" | "out";
}) {
  return (
    <div>
      <p className="text-[var(--tlkv-muted)]">{label}</p>
      <p
        className={`mt-0.5 font-semibold tabular-nums ${
          tone === "in"
            ? "text-[var(--tlkv-green)]"
            : tone === "out"
              ? "text-[var(--tlkv-red)]"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--tlkv-bg)] px-4 py-3">
      <p className="text-[12px] text-[var(--tlkv-muted)]">{label}</p>
      <p className="mt-1 text-[18px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function CashActionModal({
  kind,
  accounts,
  onClose,
  onDone,
  onError,
}: {
  kind: Exclude<ModalKind, null>;
  accounts: CashAccountCard[];
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? "");
  const [amountText, setAmountText] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const amountDong = Number(amountText.replace(/\D/g, "")) || 0;
  const title =
    kind === "deposit" ? "Nạp tiền" : kind === "withdraw" ? "Rút tiền" : "Chuyển tiền";

  const previewAccount =
    kind === "transfer"
      ? accounts.find((a) => a.id === fromId)
      : accounts.find((a) => a.id === accountId);
  const previewTo = accounts.find((a) => a.id === toId);
  const afterFrom =
    previewAccount == null
      ? 0
      : kind === "deposit"
        ? previewAccount.balanceDong + amountDong
        : previewAccount.balanceDong - amountDong;
  const afterTo = previewTo == null ? 0 : previewTo.balanceDong + amountDong;

  async function submit() {
    if (amountDong <= 0) {
      onError("Số tiền phải lớn hơn 0");
      return;
    }
    setSaving(true);
    try {
      if (kind === "deposit") {
        await depositCash({ accountId, amountDong, content: content || "Thu khác" });
      } else if (kind === "withdraw") {
        await withdrawCash({ accountId, amountDong, content: content || "Chi khác" });
      } else {
        await transferCash({
          fromAccountId: fromId,
          toAccountId: toId,
          amountDong,
          content: content || "Chuyển tiền nội bộ",
        });
      }
      onError(null);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không thực hiện được giao dịch");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[12px] bg-white p-5 shadow-xl">
        <h3 className="text-[16px] font-semibold">{title}</h3>
        <div className="mt-4 space-y-3">
          {kind === "transfer" ? (
            <>
              <Field label="Từ tài khoản">
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatDong(a.balanceDong)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Đến tài khoản">
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatDong(a.balanceDong)})
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <Field label="Tài khoản">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatDong(a.balanceDong)})
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Số tiền (đ)">
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
          </Field>
          <Field label="Nội dung">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Mô tả giao dịch"
              className="h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px]"
            />
          </Field>
          <div className="rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[12px]">
            <p className="font-medium">Số dư sau giao dịch</p>
            {kind === "transfer" ? (
              <div className="mt-1 space-y-1">
                <p>
                  {previewAccount?.name}: {formatDong(Math.max(0, afterFrom))}
                </p>
                <p>
                  {previewTo?.name}: {formatDong(afterTo)}
                </p>
              </div>
            ) : (
              <p className="mt-1">{formatDong(Math.max(0, afterFrom))}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px]"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Đang xử lý..." : "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[var(--tlkv-muted)]">{label}</span>
      {children}
    </label>
  );
}
