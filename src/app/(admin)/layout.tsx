import { AdminShell } from "@/shared/layout/AdminShell";
import { formatViDate } from "@/shared/lib/datetime";
import { createServerSupabase } from "@/shared/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type DashboardMeta = {
  businessDate: string;
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: dashboardData, error: adminError } = await supabase.rpc("pos_get_dashboard");
  if (adminError) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--tlkv-bg)] p-6">
        <div className="max-w-md rounded-[12px] bg-white p-8 shadow-[var(--tlkv-shadow)]">
          <h1 className="text-xl font-semibold">Không đủ quyền</h1>
          <p className="mt-2 text-sm text-[var(--tlkv-muted)]">
            Tài khoản đã đăng nhập nhưng không nằm trong danh sách quản trị POS.
          </p>
        </div>
      </div>
    );
  }

  const businessDate = (dashboardData as DashboardMeta).businessDate;

  return (
    <AdminShell
      businessDateLabel={formatViDate(businessDate)}
      userEmail={user.email ?? ""}
      userName={user.email?.split("@")[0] ?? "Admin"}
    >
      {children}
    </AdminShell>
  );
}
