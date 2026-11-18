"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import {
  dongCaretFromDigitIndex,
  dongDigitIndexBeforeCaret,
  extractDongDigits,
  formatDongDigits,
} from "@/shared/lib/money";

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode" | "defaultValue"
>;

export type DongInputProps = NativeProps & {
  /**
   * Digit-only string ("" or "1500000"). Display is auto-formatted with `.` thousand separators.
   * Never store the dotted display string in parent state.
   */
  value: string;
  onValueChange: (digits: string) => void;
  /** When set, also render a hidden input with raw digits for FormData submits. */
  name?: string;
};

/**
 * VND money text input: live `1.500.000` display, digit-only value for calc/backend.
 * Cursor stays on the intended digit when inserting/deleting mid-string.
 */
export function DongInput({
  value,
  onValueChange,
  name,
  className,
  onBlur,
  onFocus,
  ...rest
}: DongInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);

  const digits = extractDongDigits(value);
  const display = digits === "" ? "" : formatDongDigits(Number(digits));

  useLayoutEffect(() => {
    const el = inputRef.current;
    const nextCaret = caretRef.current;
    if (!el || nextCaret == null || !focused) return;
    el.setSelectionRange(nextCaret, nextCaret);
    caretRef.current = null;
  }, [display, focused]);

  function commitFromRaw(raw: string, caretInRaw: number) {
    const nextDigits = extractDongDigits(raw);
    const digitIndex = dongDigitIndexBeforeCaret(raw, caretInRaw);
    const nextDisplay = nextDigits === "" ? "" : formatDongDigits(Number(nextDigits));
    caretRef.current = dongCaretFromDigitIndex(nextDisplay, digitIndex);
    onValueChange(nextDigits);
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={digits} readOnly /> : null}
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={display}
        className={className}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          caretRef.current = null;
          onBlur?.(event);
        }}
        onChange={(event) => {
          const el = event.currentTarget;
          commitFromRaw(el.value, el.selectionStart ?? el.value.length);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          rest.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const key = event.key;
          // Digits only while typing; paste of dotted amounts still goes through onChange.
          if (key.length === 1 && !/\d/.test(key)) {
            event.preventDefault();
          }
        }}
      />
    </>
  );
}

/** Controlled by integer dong (null = empty field, not coerced to 0). */
export function DongNumberInput({
  value,
  onValueChange,
  emptyAsNull = true,
  ...rest
}: Omit<DongInputProps, "value" | "onValueChange"> & {
  value: number | null;
  onValueChange: (next: number | null) => void;
  /** When false, clearing the field emits 0 instead of null. */
  emptyAsNull?: boolean;
}) {
  const digitValue = value == null ? "" : String(Math.trunc(value));

  return (
    <DongInput
      {...rest}
      value={digitValue}
      onValueChange={(next) => {
        if (!next) {
          onValueChange(emptyAsNull ? null : 0);
          return;
        }
        onValueChange(Number(next));
      }}
    />
  );
}
