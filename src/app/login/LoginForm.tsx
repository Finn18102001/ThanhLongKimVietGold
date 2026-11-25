"use client";

import { useFormStatus } from "react-dom";
import { CircleNotch } from "@phosphor-icons/react";
import { signIn } from "./actions";

function PendingOverlay() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[12px] bg-white/80 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
    >
      <CircleNotch size={28} className="animate-spin text-[var(--tlkv-red)]" weight="bold" />
      <p className="text-[13px] font-medium text-[var(--tlkv-text)]">Đang xử lý đăng nhập…</p>
      <p className="text-[12px] text-[var(--tlkv-muted)]">Vui lòng chờ phản hồi từ hệ thống.</p>
    </div>
  );
}

function EmailInput() {
  const { pending } = useFormStatus();
  return (
    <input
      name="email"
      type="email"
      required
      disabled={pending}
      autoComplete="username"
      className="mt-1.5 h-11 w-full rounded-lg border border-[var(--tlkv-line)] px-3 outline-none focus:border-[var(--tlkv-red)] disabled:cursor-not-allowed disabled:bg-[var(--tlkv-bg)] disabled:opacity-70"
    />
  );
}

function PasswordInput() {
  const { pending } = useFormStatus();
  return (
    <input
      name="password"
      type="password"
      required
      disabled={pending}
      autoComplete="current-password"
      className="mt-1.5 h-11 w-full rounded-lg border border-[var(--tlkv-line)] px-3 outline-none focus:border-[var(--tlkv-red)] disabled:cursor-not-allowed disabled:bg-[var(--tlkv-bg)] disabled:opacity-70"
    />
  );
}

function SubmitButton() {
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
          Đang đăng nhập…
        </>
      ) : (
        "Đăng nhập"
      )}
    </button>
  );
}

export function LoginForm({
  error,
  nextPath,
}: {
  error?: string;
  nextPath: string;
}) {
  return (
    <form action={signIn} className="relative p-8 pt-6">
      <PendingOverlay />
      <h1 className="text-2xl font-semibold text-center">Đăng nhập POS</h1>
      <p className="mt-2 text-sm text-center text-[var(--tlkv-muted)]">
        Dùng tài khoản quản trị hoặc nhân viên đã được cấp trong hệ thống.
      </p>
      {error ? (
        <p className="mt-4 rounded-lg bg-[var(--tlkv-red-soft)] px-3 py-2 text-sm text-[var(--tlkv-red)]">
          {error}
        </p>
      ) : null}
      <input type="hidden" name="next" value={nextPath} />
      <label className="mt-6 block text-sm font-medium">
        Email
        <EmailInput />
      </label>
      <label className="mt-4 block text-sm font-medium">
        Mật khẩu
        <PasswordInput />
      </label>
      <SubmitButton />
    </form>
  );
}
