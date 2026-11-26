import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/shared/brand/BrandLockup";
import { requiresAdminRoleOtp } from "@/shared/auth/otp-allowlist";
import { createServerSupabase } from "@/shared/supabase/server";
import { getPosSession } from "@/shared/auth/session";
import { OtpResendForm, OtpSignOutForm, OtpVerifyForm } from "./OtpForms";

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

  const session = await getPosSession();
  if (!requiresAdminRoleOtp(session?.role) && !session?.otp?.required) {
    redirect(next);
  }
  if (session?.otp?.verified) {
    redirect(next);
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--tlkv-bg)] px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
        <BrandLockup variant="login" />
        <div className="relative p-8 pt-6">
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

          <OtpVerifyForm nextPath={next} />
          <OtpResendForm nextPath={next} />
          <OtpSignOutForm />
        </div>
      </div>
    </div>
  );
}
