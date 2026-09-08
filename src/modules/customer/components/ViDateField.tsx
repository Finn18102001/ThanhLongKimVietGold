"use client";

import { useEffect, useId, useState } from "react";
import { formatViDate, parseViDateInput } from "@/shared/lib/datetime";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)]";

/**
 * Date field shown/edited as dd/mm/yyyy (VN). Value prop/callback stays ISO yyyy-mm-dd for BE.
 * Native calendar picker still available; text display does not follow OS mm/dd/yyyy locale.
 */
export function ViDateField({
  label,
  valueIso,
  onChangeIso,
  className = FIELD,
}: {
  label: string;
  valueIso: string;
  onChangeIso: (iso: string) => void;
  className?: string;
}) {
  const pickerId = useId();
  const [text, setText] = useState(() => (valueIso ? formatViDate(valueIso) : ""));

  useEffect(() => {
    setText(valueIso ? formatViDate(valueIso) : "");
  }, [valueIso]);

  function commitText(next: string) {
    setText(next);
    if (!next.trim()) {
      onChangeIso("");
      return;
    }
    const iso = parseViDateInput(next);
    if (iso) onChangeIso(iso);
  }

  function onBlur() {
    if (!text.trim()) {
      onChangeIso("");
      setText("");
      return;
    }
    const iso = parseViDateInput(text);
    if (iso) {
      onChangeIso(iso);
      setText(formatViDate(iso));
      return;
    }
    // Invalid → revert to last good ISO display
    setText(valueIso ? formatViDate(valueIso) : "");
  }

  return (
    <label className="text-[13px]">
      {label}
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/yyyy"
          value={text}
          onChange={(e) => commitText(e.target.value)}
          onBlur={onBlur}
          className={`${className} pr-10`}
        />
        <input
          id={pickerId}
          type="date"
          value={valueIso}
          onChange={(e) => onChangeIso(e.target.value)}
          className="absolute inset-y-0 right-0 w-10 cursor-pointer opacity-0"
          tabIndex={-1}
          aria-label={`${label} — chọn từ lịch`}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--tlkv-muted)]"
        >
          <CalendarIcon />
        </span>
      </div>
    </label>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
