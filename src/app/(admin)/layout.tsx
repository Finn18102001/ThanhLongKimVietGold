import { forceSignOut, signOut } from "@/app/login/actions";
import { PermissionGate } from "@/shared/auth/PermissionGate";
import { canAdminRead, type StaffRole } from "@/shared/auth/permissions";
import { getPosSession } from "@/shared/auth/session";
import { msUntil } from "@/shared/auth/session-policy";
import { AdminShell } from "@/shared/layout/AdminShell";
import { formatViDate } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
import { canOpenEmployeeCashModule } from "@/modules/fund-cash/query";
import { canOpenEmployeeGoldModule } from "@/modules/fund-gold/query";
import { openWorkShiftBestEffort } from "@/modules/work-shift/shift-lifecycle";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const session = await getPosSession();
  if (!session) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--tlkv-bg)] px-4">
        <div className="w-full max-w-md border-t-2 border-[var(--tlkv-red)] bg-white px-8 py-10 shadow-[var(--tlkv-shadow)]">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--tlkv-faint)] uppercase">
            Chưa được cấp quyền POS
          </p>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight">
            Tài khoản chưa vào được hệ thống
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--tlkv-muted)]">
            Bạn đang đăng nhập{user.email ? ` với ${user.email}` : ""}. Tài khoản này chưa có trong
            danh sách nhân viên POS (hoặc đã bị tắt). Nhờ quản trị thêm ở mục Nhân viên.
          </p>
          <form action={signOut} className="mt-8">
            <button
              type="submit"
              className="h-11 border border-[var(--tlkv-line)] px-5 text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
            >
              Đăng xuất
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Future 3 — mọi ADMIN phải verify OTP trước admin shell.
  if (session.otp?.required && !session.otp.verified) {
    redirect(`/login/otp?next=${encodeURIComponent("/")}`);
  }

  // Future 2 — absolute 24h (all roles; ADMIN clock starts after OTP).
  if (msUntil(session.sessionExpiresAt) === 0) {
    await forceSignOut("session");
  }

  // Future 1 — work hours for non-Admin only (UX early exit; SQL require_* remains SoT).
  if (
    !canAdminRead(session.role) &&
    session.workHours?.applies &&
    !session.workHours.within
  ) {
    await forceSignOut("work_hours");
  }

  // P11 — ensure STAFF ca đang mở khi còn trong khung giờ (idempotent; mid-session deploy).
  if (
    !canAdminRead(session.role) &&
    session.workHours?.applies &&
    session.workHours.within
  ) {
    await openWorkShiftBestEffort();
  }

  const role = session.role as StaffRole;

  // PERF-002: parallel gates (same allow rules); React.cache dedupes with page shell.
  const [cashGate, goldGate] = await Promise.all([
    canOpenEmployeeCashModule().catch(() => null),
    canOpenEmployeeGoldModule().catch(() => null),
  ]);
  const showFundCash = cashGate?.allowed === true;
  const showFundGold = goldGate?.allowed === true;

  return (
    <AdminShell
      businessDateLabel={formatViDate(session.businessDate)}
      userEmail={session.email}
      userName={session.fullName}
      role={role}
      showFundCash={showFundCash}
      showFundGold={showFundGold}
      sessionExpiresAt={session.sessionExpiresAt}
      workHoursApplies={Boolean(session.workHours?.applies)}
      workHoursEndAt={session.workHours?.endAt ?? null}
    >
      <PermissionGate role={role}>{children}</PermissionGate>
    </AdminShell>
  );
}
