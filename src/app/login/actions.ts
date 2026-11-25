"use server";

import { redirect } from "next/navigation";
import { canAdminRead } from "@/shared/auth/permissions";
import { requiresAdminEmailOtp } from "@/shared/auth/otp-allowlist";
import { getPosSession } from "@/shared/auth/session";
import {
  OTP_REQUIRED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  WORK_HOURS_ENDED_MESSAGE,
  msUntil,
} from "@/shared/auth/session-policy";
import { isOtpSmtpConfigured, sendOtpEmail } from "@/shared/email/send-otp-email";
import {
  closeWorkShiftBestEffort,
  openWorkShiftBestEffort,
} from "@/modules/work-shift/shift-lifecycle";
import { createServerSupabase } from "@/shared/supabase/server";

function loginErrorRedirect(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

function mapOtpError(message: string | undefined): string {
  const raw = String(message ?? "");
  if (raw.includes("OTP_RESEND_TOO_SOON")) return "Vui lòng đợi trước khi gửi lại mã OTP.";
  if (raw.includes("OTP_EXPIRED")) return "Mã OTP đã hết hạn. Hãy gửi lại mã mới.";
  if (raw.includes("OTP_TOO_MANY_ATTEMPTS")) return "Nhập sai quá nhiều lần. Hãy gửi lại mã mới.";
  if (raw.includes("OTP_INVALID")) return "Mã OTP không đúng.";
  if (raw.includes("OTP_NOT_FOUND")) return "Chưa có mã OTP. Hãy gửi mã mới.";
  if (raw.includes("OTP_NO_SESSION")) return "Phiên đăng nhập không hợp lệ. Đăng nhập lại.";
  return raw || "Không xác thực được OTP.";
}

function mapSmtpError(detail?: string): string {
  const raw = String(detail ?? "");
  if (raw.includes("535") || /BadCredentials|Username and Password not accepted/i.test(raw)) {
    return "Không gửi được email OTP: Gmail từ chối đăng nhập SMTP. Kiểm tra App Password trong .env.local.";
  }
  if (!isOtpSmtpConfigured()) {
    return "Chưa cấu hình SMTP (SMTP_USER / SMTP_PASS). Không thể gửi mã OTP.";
  }
  return raw
    ? `Không gửi được email OTP: ${raw}`
    : "Không gửi được email OTP. Thử lại hoặc kiểm tra SMTP.";
}

type OtpChallenge = {
  ok?: boolean;
  email?: string;
  expires_in_seconds?: number;
  resend_after_seconds?: number;
  code?: string | null;
};

async function createOtpChallenge(): Promise<OtpChallenge> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_create_login_otp_challenge");
  if (error) {
    throw new Error(mapOtpError(error.message));
  }
  return data as OtpChallenge;
}

/** Send OTP mail. No DEV UI fallback — fail with error only. */
async function sendOtpOrThrow(challenge: OtpChallenge): Promise<void> {
  const code = String(challenge.code ?? "").trim();
  const toEmail = String(challenge.email ?? "").trim();
  const expiresMinutes = Math.max(
    1,
    Math.round(Number(challenge.expires_in_seconds ?? 600) / 60),
  );

  if (!code || !toEmail) {
    throw new Error("Thiếu mã OTP để gửi email.");
  }
  if (!isOtpSmtpConfigured()) {
    throw new Error(mapSmtpError());
  }

  const sent = await sendOtpEmail({ toEmail, code, expiresMinutes });
  if (!sent.ok) {
    throw new Error(mapSmtpError(sent.detail));
  }
}

function otpPageUrl(opts: { next: string; sent?: boolean; mailed?: boolean; error?: string | null }): string {
  const params = new URLSearchParams();
  params.set("next", opts.next.startsWith("/") ? opts.next : "/");
  if (opts.sent) params.set("sent", "1");
  if (opts.mailed) params.set("mailed", "1");
  if (opts.error) params.set("error", opts.error);
  return `/login/otp?${params.toString()}`;
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginErrorRedirect("Email hoặc mật khẩu không đúng");
  }

  const session = await getPosSession();
  if (!session) {
    await supabase.auth.signOut();
    loginErrorRedirect("Tài khoản chưa được cấp quyền POS hoặc đã bị tắt.");
  }

  const expiresIn = msUntil(session.sessionExpiresAt);
  if (expiresIn === 0) {
    await supabase.auth.signOut();
    loginErrorRedirect(SESSION_EXPIRED_MESSAGE);
  }

  if (!canAdminRead(session.role) && session.workHours?.applies && !session.workHours.within) {
    await supabase.auth.signOut();
    loginErrorRedirect(WORK_HOURS_ENDED_MESSAGE);
  }

  // Future 3 — allowlist Admin: password OK → OTP email → /login/otp
  if (requiresAdminEmailOtp(session.email) && !session.otp?.verified) {
    try {
      const challenge = await createOtpChallenge();
      await sendOtpOrThrow(challenge);
    } catch (err) {
      await supabase.auth.signOut();
      loginErrorRedirect(err instanceof Error ? err.message : OTP_REQUIRED_MESSAGE);
    }
    redirect(otpPageUrl({ next, mailed: true }));
  }

  // P11 — STAFF: auto mở ca sau login thành công trong khung giờ (Admin RPC no-op).
  await openWorkShiftBestEffort();

  redirect(next.startsWith("/") ? next : "/");
}

export async function resendLoginOtp(formData: FormData) {
  const next = String(formData.get("next") ?? "/") || "/";
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    loginErrorRedirect("Phiên đăng nhập không hợp lệ. Đăng nhập lại.");
  }
  if (!requiresAdminEmailOtp(user.email)) {
    redirect(next.startsWith("/") ? next : "/");
  }

  try {
    const challenge = await createOtpChallenge();
    await sendOtpOrThrow(challenge);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không gửi lại được OTP.";
    redirect(otpPageUrl({ next, error: message }));
  }

  redirect(otpPageUrl({ next, sent: true, mailed: true }));
}

export async function verifyLoginOtp(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "/") || "/";
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    loginErrorRedirect("Phiên đăng nhập không hợp lệ. Đăng nhập lại.");
  }
  if (!requiresAdminEmailOtp(user.email)) {
    redirect(next.startsWith("/") ? next : "/");
  }

  const { error } = await supabase.rpc("pos_verify_login_otp", { p_code: code });
  if (error) {
    redirect(otpPageUrl({ next, error: mapOtpError(error.message) }));
  }
  redirect(next.startsWith("/") ? next : "/");
}

export async function signOut() {
  await closeWorkShiftBestEffort("logout");
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Force logout with SRS message (work hours / 24h timer / multi-tab sync). */
export async function forceSignOut(reason?: string) {
  await closeWorkShiftBestEffort(
    reason === "work_hours" ? "auto_end_of_day" : "logout",
  );
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  const message =
    reason === "session"
      ? SESSION_EXPIRED_MESSAGE
      : reason === "work_hours"
        ? WORK_HOURS_ENDED_MESSAGE
        : reason === "otp"
          ? OTP_REQUIRED_MESSAGE
          : reason?.trim() || WORK_HOURS_ENDED_MESSAGE;
  redirect(`/login?error=${encodeURIComponent(message)}`);
}
