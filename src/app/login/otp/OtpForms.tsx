"use client";

import { useFormStatus } from "react-dom";
import { CircleNotch } from "@phosphor-icons/react";
import { resendLoginOtp, signOut, verifyLoginOtp } from "../actions";

function FormPendingOverlay({ message }: { message: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[12px] bg-white/80 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
    >
      <CircleNotch size={28} className="animate-spin text-[var(--tlkv-red)]" weight="bold" />
      <p className="text-[13px] font-medium text-[var(--tlkv-text)]">{message}</p>
      <p className="text-[12px] text-[var(--tlkv-muted)]">Vui lòng chờ phản hồi từ hệ thống.</p>
    </div>
  );
}

function OtpCodeInput() {
  const { pending } = useFormStatus();
  return (
    <input
      name="code"
      type="text"
      inputMode="numeric"
      pattern="[0-9]{6}"
      maxLength={6}
      required
      disabled={pending}
      autoComplete="one-time-code"
      className="mt-1.5 h-11 w-full rounded-lg border border-[var(--tlkv-line)] px-3 tracking-[0.3em] outline-none focus:border-[var(--tlkv-red)] disabled:cursor-not-allowed disabled:bg-[var(--tlkv-bg)] disabled:opacity-70"
    />
  );
}

function VerifyButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--tlkv-brand-header-red)] font-semibold text-[var(--tlkv-brand-gold)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <CircleNotch size={18} className="animate-spin" weight="bold" aria-hidden />
          Đang xác nhận…
        </>
      ) : (
        "Xác nhận"
      )}
    </button>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium transition hover:bg-[var(--tlkv-bg)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <CircleNotch size={16} className="animate-spin" weight="bold" aria-hidden />
          Đang gửi lại…
        </>
      ) : (
        "Gửi lại mã"
      )}
    </button>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 w-full text-[13px] font-medium text-[var(--tlkv-muted)] transition hover:text-[var(--tlkv-text)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Đang đăng xuất…" : "Đăng xuất / dùng tài khoản khác"}
    </button>
  );
}

export function OtpVerifyForm({ nextPath }: { nextPath: string }) {
  return (
    <form action={verifyLoginOtp} className="relative mt-6 min-h-[9rem]">
      <FormPendingOverlay message="Đang xác thực OTP…" />
      <input type="hidden" name="next" value={nextPath} />
      <label className="block text-sm font-medium">
        Mã OTP
        <OtpCodeInput />
      </label>
      <VerifyButton />
    </form>
  );
}

export function OtpResendForm({ nextPath }: { nextPath: string }) {
  return (
    <form action={resendLoginOtp} className="relative mt-3">
      <FormPendingOverlay message="Đang gửi lại mã OTP…" />
      <input type="hidden" name="next" value={nextPath} />
      <ResendButton />
    </form>
  );
}

export function OtpSignOutForm() {
  return (
    <form action={signOut} className="mt-3">
      <SignOutButton />
    </form>
  );
}
