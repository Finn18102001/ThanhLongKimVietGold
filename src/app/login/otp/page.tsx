import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/shared/brand/BrandLockup";
import { requiresAdminEmailOtp } from "@/shared/auth/otp-allowlist";
import { createServerSupabase } from "@/shared/supabase/server";
import { getPosSession } from "@/shared/auth/session";
import { resendLoginOtp, signOut, verifyLoginOtp } from "../actions";

export const metadata: Metadata = {
  title: "Xác thực OTP",
};

export default async function LoginOtpPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    next?: string;
    sent?: string;
    mailed?: string;
  }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : "/";

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!requiresAdminEmailOtp(user.email)) {
    redirect(next);
  }

  const session = await getPosSession();
  if (session?.otp?.verified) {
    redirect(next);
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--tlkv-bg)] px-4">
      <div className="w-full max-w-md overflow-hidden rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
        <BrandLockup variant="login" />
        <div className="p-8 pt-6">
          <h1 className="text-2xl font-semibold text-center">Xác thực OTP email</h1>
          <p className="mt-2 text-sm text-center text-[var(--tlkv-muted)]">
            Mã 6 số được gửi tới{" "}
            <span className="font-medium text-[var(--tlkv-text)]">{user.email}</span>
            {params.mailed ? " qua email" : ""}. Mã có hiệu lực vài phút.
          </p>
          {params.mailed ? (
            <p className="mt-3 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-sm text-[var(--tlkv-muted)]">
              Kiểm tra hộp thư (và mục Spam). Người gửi: tuananh18101@gmail.com
            </p>
          ) : null}
          {params.sent ? (
            <p className="mt-3 rounded-lg bg-[var(--tlkv-bg)] px-3 py-2 text-sm text-[var(--tlkv-muted)]">
              Đã gửi lại mã OTP.
            </p>
          ) : null}
          {params.error ? (
            <p className="mt-4 rounded-lg bg-[var(--tlkv-red-soft)] px-3 py-2 text-sm text-[var(--tlkv-red)]">
              {params.error}
            </p>
          ) : null}

          <form action={verifyLoginOtp} className="mt-6">
            <input type="hidden" name="next" value={next} />
            <label className="block text-sm font-medium">
              Mã OTP
              <input
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoComplete="one-time-code"
                className="mt-1.5 h-11 w-full rounded-lg border border-[var(--tlkv-line)] px-3 tracking-[0.3em] outline-none focus:border-[var(--tlkv-red)]"
              />
            </label>
            <button
              type="submit"
              className="mt-6 h-11 w-full rounded-lg bg-[var(--tlkv-brand-header-red)] font-semibold text-[var(--tlkv-brand-gold)] hover:opacity-90"
            >
              Xác nhận
            </button>
          </form>

          <form action={resendLoginOtp} className="mt-3">
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="h-11 w-full rounded-lg border border-[var(--tlkv-line)] text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
            >
              Gửi lại mã
            </button>
          </form>

          <form action={signOut} className="mt-3">
            <button
              type="submit"
              className="h-10 w-full text-[13px] font-medium text-[var(--tlkv-muted)] hover:text-[var(--tlkv-text)]"
            >
              Đăng xuất / dùng tài khoản khác
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
