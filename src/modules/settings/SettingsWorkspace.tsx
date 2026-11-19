"use client";

import { useState, useTransition } from "react";
import type { EmployeeFundFlagState } from "@/shared/lib/feature-flags";
import { EMPLOYEE_FUND_FLAG_KEY, EMPLOYEE_FUND_FORCE_OFF_ENV } from "@/shared/lib/feature-flags";
import { formatActionError } from "@/shared/lib/action-result";
import { setEmployeeFundFlag } from "./actions";

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { hour12: false });
}

export function SettingsWorkspace({
  initialFlag,
  canMutate,
}: {
  initialFlag: EmployeeFundFlagState;
  canMutate: boolean;
}) {
  const [flag, setFlag] = useState(initialFlag);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    if (!canMutate || pending) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await setEmployeeFundFlag(next);
      if (!result.ok) {
        setError(formatActionError(result.message, "Không lưu được Feature Flag."));
        return;
      }
      setFlag(result.data);
      if (next && result.data.forceOff) {
        setNotice(
          `Đã lưu DB = BẬT, nhưng ENV ${EMPLOYEE_FUND_FORCE_OFF_ENV}=1 đang ép tắt — hiệu lực vẫn TẮT (AS-IS).`,
        );
      } else {
        setNotice(
          result.data.enabled
            ? "Đã bật Quỹ nhân viên. Nghiệp vụ mới chỉ áp dụng khi các module quỹ được triển khai."
            : "Đã tắt Quỹ nhân viên. Hệ thống giữ luồng AS-IS.",
        );
      }
    });
  }

  const effectiveOn = flag.enabled;
  const dbOn = flag.dbEnabled;

  return (
    <div className="space-y-5">
      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--tlkv-faint)] uppercase">
          Cài đặt
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Cấu hình hệ thống</h1>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-6 text-[var(--tlkv-muted)]">
          Module 1 P10 — Feature Flag Quỹ nhân viên. Khi tắt, POS/mua hàng giữ nguyên nghiệp vụ AS-IS.
        </p>
      </section>

      <section className="rounded-[12px] bg-white p-5 shadow-[var(--tlkv-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[60ch]">
            <h2 className="text-[16px] font-semibold tracking-tight">Quỹ nhân viên</h2>
            <p className="mt-1 text-[13px] leading-6 text-[var(--tlkv-muted)]">
              Key <code className="rounded bg-[var(--tlkv-bg)] px-1.5 py-0.5 text-[12px]">{EMPLOYEE_FUND_FLAG_KEY}</code>
              . Mặc định tắt trên production. ENV{" "}
              <code className="rounded bg-[var(--tlkv-bg)] px-1.5 py-0.5 text-[12px]">
                {EMPLOYEE_FUND_FORCE_OFF_ENV}=1
              </code>{" "}
              chỉ có quyền ép tắt.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={dbOn}
            disabled={!canMutate || pending}
            onClick={() => toggle(!dbOn)}
            className={`relative inline-flex h-9 w-[64px] shrink-0 items-center rounded-full border transition ${
              dbOn
                ? "border-[var(--tlkv-red)] bg-[var(--tlkv-red)]"
                : "border-[var(--tlkv-line)] bg-[var(--tlkv-bg)]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span
              className={`absolute h-7 w-7 rounded-full bg-white shadow transition ${
                dbOn ? "right-1" : "left-1"
              }`}
            />
            <span className="sr-only">{dbOn ? "Tắt Feature Flag" : "Bật Feature Flag"}</span>
          </button>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[var(--tlkv-bg)] px-3 py-2.5">
            <dt className="text-[11px] text-[var(--tlkv-muted)]">Giá trị DB</dt>
            <dd className="mt-0.5 text-[14px] font-semibold">{dbOn ? "BẬT" : "TẮT"}</dd>
          </div>
          <div className="rounded-lg bg-[var(--tlkv-bg)] px-3 py-2.5">
            <dt className="text-[11px] text-[var(--tlkv-muted)]">Hiệu lực (sau ENV)</dt>
            <dd className="mt-0.5 text-[14px] font-semibold">
              {effectiveOn ? "BẬT" : "TẮT (AS-IS)"}
            </dd>
          </div>
          <div className="rounded-lg bg-[var(--tlkv-bg)] px-3 py-2.5">
            <dt className="text-[11px] text-[var(--tlkv-muted)]">ENV ép tắt</dt>
            <dd className="mt-0.5 text-[14px] font-semibold">{flag.forceOff ? "Có" : "Không"}</dd>
          </div>
        </dl>

        <p className="mt-4 text-[12px] text-[var(--tlkv-muted)]">
          Cập nhật lần cuối: {formatUpdatedAt(flag.updatedAt)}
          {flag.updatedBy ? ` · ${flag.updatedBy}` : ""}
        </p>

        {!canMutate ? (
          <p className="mt-3 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[12px] text-[var(--tlkv-muted)]">
            Tài khoản chỉ xem — không được bật/tắt Feature Flag.
          </p>
        ) : null}

        {error ? <p className="mt-3 text-[13px] text-[var(--tlkv-red)]">{error}</p> : null}
        {notice ? (
          <p className="mt-3 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-[13px] text-[var(--tlkv-text)]">
            {notice}
          </p>
        ) : null}
        {pending ? (
          <p className="mt-2 text-[12px] text-[var(--tlkv-muted)]">Đang lưu…</p>
        ) : null}
      </section>
    </div>
  );
}
