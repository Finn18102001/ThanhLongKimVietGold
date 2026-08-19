import { GoldPriceWidget } from "@/modules/pricing/GoldPriceWidget";
import { getGoldPriceQuote } from "@/modules/pricing/query";
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

  const { error: adminError } = await supabase.rpc("pos_get_dashboard");
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

  const quote = await getGoldPriceQuote();

  return (
    <AdminShell
      businessDateLabel={formatViDate(quote.quotedAt.slice(0, 10))}
      goldPriceSlot={<GoldPriceWidget quote={quote} />}
      userEmail={user.email ?? ""}
      userName={user.email?.split("@")[0] ?? "Admin"}
    >
      {children}
    </AdminShell>
  );
}
