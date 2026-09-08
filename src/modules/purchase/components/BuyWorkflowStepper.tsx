"use client";

import { buyWorkflowStepIndex, BUY_WORKFLOW_STEPS } from "../workflowLabels";
import type { BuyDetail } from "../types";

export function BuyWorkflowStepper({
  buy,
}: {
  buy: Pick<BuyDetail, "workflowStatus" | "status" | "form02No" | "attachmentPdfPath">;
}) {
  const active = buyWorkflowStepIndex(buy);
  const cancelled = active < 0;

  return (
    <nav aria-label="Tiến trình mua vàng" className="w-full overflow-x-auto">
      <ol className="flex min-w-[640px] items-start gap-0">
        {BUY_WORKFLOW_STEPS.map((step, index) => {
          const done = !cancelled && active > index;
          const current = !cancelled && active === index;
          return (
            <li key={step.id} className="relative flex flex-1 flex-col items-center px-0.5">
              {index < BUY_WORKFLOW_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={`absolute left-[calc(50%+10px)] right-[calc(-50%+10px)] top-[11px] h-px ${
                    done || current ? "bg-[var(--tlkv-red)]" : "bg-[var(--tlkv-line)]"
                  }`}
                />
              ) : null}
              <span
                className={`relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold ${
                  cancelled
                    ? "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]"
                    : current
                      ? "bg-[var(--tlkv-red)] text-white"
                      : done
                        ? "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                        : "bg-white text-[var(--tlkv-muted)] ring-1 ring-[var(--tlkv-line)]"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`mt-1.5 max-w-[72px] text-center text-[10px] leading-tight ${
                  current
                    ? "font-semibold text-[var(--tlkv-red)]"
                    : done
                      ? "font-medium text-[var(--tlkv-text)]"
                      : "text-[var(--tlkv-muted)]"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {cancelled ? (
        <p className="mt-2 text-[11px] font-medium text-[var(--tlkv-red)]">Giao dịch đã hủy</p>
      ) : null}
    </nav>
  );
}
