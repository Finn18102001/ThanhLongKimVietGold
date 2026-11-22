"use client";

import { useMemo, useState } from "react";
import { formatDong } from "@/shared/lib/money";
import { CashRequestCards } from "./CashRequestCards";
import { CashTransferPanel } from "./CashTransferPanel";
import type {
  CashRequestListPage,
  CashTransferListPage,
  EmployeeCashAccount,
  EmployeeCashLedgerPage,
} from "./types";

type ClerkTab = "queue" | "transfer" | "shift";

function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * NV Quỹ tiền: hàng đợi card + CTCT + ca/lịch sử (UI).
 * Dùng trên /fund-cash khi không phải admin mutate; Bán/Mua dùng CashRequestCards riêng.
 */
export function CashFundClerkWorkspace({
  account,
  initialRequests,
  initialTransfers,
  initialLedger,
  canAct,
  canTransfer,
  defaultTab = "queue",
  queueKind = "THU",
}: {
  account: EmployeeCashAccount | null;
  initialRequests: CashRequestListPage;
  initialTransfers: CashTransferListPage;
  initialLedger: EmployeeCashLedgerPage;
  canAct: boolean;
  canTransfer: boolean;
  defaultTab?: ClerkTab;
  /** Khi nhúng full page Quỹ tiền — mặc định xem cả THU+CHI qua filter trong cards? dùng 2 section. */
  queueKind?: "THU" | "CHI" | "BOTH";
}) {
  const [tab, setTab] = useState<ClerkTab>(defaultTab);

  const shift = useMemo(() => {
    const dayStart = startOfLocalDay().getTime();
    const today = initialLedger.items
      .filter((r) => new Date(r.occurredAt).getTime() >= dayStart)
      .slice()
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    if (today.length === 0) {
      const bal = account?.balanceDong ?? 0;
      return {
        openingDong: bal,
        closingDong: bal,
        inDong: 0,
        outDong: 0,
        rows: [] as typeof today,
      };
    }
    const openingDong = today[0].balanceBeforeDong;
    const closingDong = today[today.length - 1].balanceAfterDong;
    const inDong = today.filter((r) => r.direction === "IN").reduce((s, r) => s + r.amountDong, 0);
    const outDong = today.filter((r) => r.direction === "OUT").reduce((s, r) => s + r.amountDong, 0);
    return { openingDong, closingDong, inDong, outDong, rows: today };
  }, [initialLedger.items, account?.balanceDong]);

  const tabs: { id: ClerkTab; label: string }[] = [
    { id: "queue", label: "Hàng đợi YC" },
    { id: "transfer", label: "Chuyển CTCT" },
    { id: "shift", label: "Ca / lịch sử" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">Quỹ tiền</h1>
            <p className="mt-1 text-[13px] text-[var(--tlkv-muted)]">
              {account
                ? `${account.code} · ${account.name} · số dư ${formatDong(account.balanceDong)}`
                : "Chưa gắn tài khoản Quỹ tiền NV."}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-9 rounded-lg px-3 text-[13px] font-semibold ${
                tab === t.id
                  ? "bg-[var(--tlkv-red)] text-white"
                  : "border border-[var(--tlkv-line)] bg-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "queue" ? (
        queueKind === "BOTH" ? (
          <div className="space-y-4">
            <CashRequestCards
              kind="THU"
              title="YC thu (bán hàng)"
              subtitle="Card chờ xác nhận — click để xem đủ thông tin."
              initialRequests={initialRequests}
              canAct={canAct}
              embedded
            />
            <CashRequestCards
              kind="CHI"
              title="YC chi (mua hàng)"
              subtitle="Card chờ xác nhận — click để xem đủ thông tin."
              initialRequests={initialRequests}
              canAct={canAct}
              embedded
            />
          </div>
        ) : (
          <CashRequestCards
            kind={queueKind}
            title={queueKind === "THU" ? "YC thu (bán hàng)" : "YC chi (mua hàng)"}
            subtitle="Card chờ xác nhận — click để xem đủ thông tin."
            initialRequests={initialRequests}
            canAct={canAct}
            embedded
          />
        )
      ) : null}

      {tab === "transfer" ? (
        <CashTransferPanel
          staffAccounts={account ? [account] : []}
          initialTransfers={initialTransfers}
          canCreate={canTransfer}
          onBalancesChanged={() => undefined}
        />
      ) : null}

      {tab === "shift" ? (
        <section className="rounded-[12px] bg-white p-4 shadow-[var(--tlkv-shadow)]">
          <h2 className="text-[15px] font-semibold">Ca làm việc hôm nay</h2>
          <p className="mt-1 text-[12px] text-[var(--tlkv-muted)]">
            UI từ sổ ledger trong ngày (chưa có RPC đóng ca riêng).
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Đầu ca", value: shift.openingDong },
              { label: "Thu trong ca", value: shift.inDong },
              { label: "Chi trong ca", value: shift.outDong },
              { label: "Cuối ca", value: shift.closingDong },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-[var(--tlkv-line)] p-3">
                <p className="text-[11px] text-[var(--tlkv-muted)]">{kpi.label}</p>
                <p className="mt-1 text-[15px] font-semibold tabular-nums">{formatDong(kpi.value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[12px] text-[var(--tlkv-muted)]">
                <tr className="border-b border-[var(--tlkv-line)]">
                  <th className="py-2 pr-3 font-medium">Thời điểm</th>
                  <th className="py-2 pr-3 font-medium">Loại</th>
                  <th className="py-2 pr-3 font-medium">±</th>
                  <th className="py-2 pr-3 font-medium">Số tiền</th>
                  <th className="py-2 font-medium">Sau</th>
                </tr>
              </thead>
              <tbody>
                {shift.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[var(--tlkv-muted)]">
                      Chưa có biến động trong ngày.
                    </td>
                  </tr>
                ) : (
                  shift.rows.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--tlkv-line)]">
                      <td className="py-2 pr-3 text-[12px]">
                        {new Date(r.occurredAt).toLocaleString("vi-VN", { hour12: false })}
                      </td>
                      <td className="py-2 pr-3">{r.txnType}</td>
                      <td className="py-2 pr-3">{r.direction}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatDong(r.amountDong)}</td>
                      <td className="py-2 tabular-nums">{formatDong(r.balanceAfterDong)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
