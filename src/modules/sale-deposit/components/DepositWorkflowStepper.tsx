"use client";

export function DepositWorkflowStepper({
  steps,
  active,
  viewing,
  cancelled,
  onSelect,
}: {
  steps: readonly { id: string; label: string }[];
  /** Highest completed / current workflow index (0-based). */
  active: number;
  /** Step currently shown in the panel (may be a past step). */
  viewing?: number;
  cancelled?: boolean;
  /** Allow opening any step index <= active. */
  onSelect?: (index: number) => void;
}) {
  const shown = viewing ?? active;
  return (
    <nav aria-label="Tiến trình đặt cọc" className="w-full overflow-x-auto">
      <ol className="flex min-w-[520px] items-start gap-0">
        {steps.map((step, index) => {
          const done = !cancelled && active > index;
          const current = !cancelled && active === index;
          const isViewing = !cancelled && shown === index;
          const canOpen = Boolean(onSelect) && !cancelled && index <= active;
          const circle = (
            <span
              className={`relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold ${
                cancelled
                  ? "bg-[var(--tlkv-slate-soft)] text-[var(--tlkv-slate)]"
                  : isViewing
                    ? "bg-[var(--tlkv-red)] text-white"
                    : done
                      ? "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)]"
                      : current
                        ? "bg-[var(--tlkv-red-soft)] text-[var(--tlkv-red)] ring-2 ring-[var(--tlkv-red)]"
                        : "bg-white text-[var(--tlkv-muted)] ring-1 ring-[var(--tlkv-line)]"
              }`}
            >
              {index + 1}
            </span>
          );
          return (
            <li key={step.id} className="relative flex flex-1 flex-col items-center px-0.5">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={`absolute left-[calc(50%+10px)] right-[calc(-50%+10px)] top-[11px] h-px ${
                    done || current ? "bg-[var(--tlkv-red)]" : "bg-[var(--tlkv-line)]"
                  }`}
                />
              ) : null}
              {canOpen ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(index)}
                  className="relative z-[1] rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tlkv-red)]"
                  aria-current={isViewing ? "step" : undefined}
                  aria-label={`Xem bước ${index + 1}: ${step.label}`}
                >
                  {circle}
                </button>
              ) : (
                circle
              )}
              <span
                className={`mt-1.5 max-w-[88px] text-center text-[10px] leading-tight ${
                  isViewing
                    ? "font-semibold text-[var(--tlkv-red)]"
                    : done || current
                      ? "font-medium text-[var(--tlkv-text)]"
                      : "text-[var(--tlkv-muted)]"
                }`}
              >
                {canOpen ? (
                  <button
                    type="button"
                    onClick={() => onSelect?.(index)}
                    className="underline-offset-2 hover:underline"
                  >
                    {step.label}
                  </button>
                ) : (
                  step.label
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
