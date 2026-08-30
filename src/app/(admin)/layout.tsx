import { signOut } from "@/app/login/actions";
import { PermissionGate } from "@/shared/auth/PermissionGate";
import { getPosSession } from "@/shared/auth/session";
import type { StaffRole } from "@/shared/auth/permissions";
import { AdminShell } from "@/shared/layout/AdminShell";
import { formatViDate } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
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

  const role = session.role as StaffRole;

  return (
    <AdminShell
      businessDateLabel={formatViDate(session.businessDate)}
      userEmail={session.email}
      userName={session.fullName}
      role={role}
    >
      <PermissionGate role={role}>{children}</PermissionGate>
    </AdminShell>
  );
}
