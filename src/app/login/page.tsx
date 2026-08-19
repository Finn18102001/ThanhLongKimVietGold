import type { Metadata } from "next";
import { signIn } from "./actions";
import { BrandLockup } from "@/shared/brand/BrandLockup";

export const metadata: Metadata = {
  title: "Đăng nhập",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--tlkv-bg)] px-4">
      <div className="w-full max-w-md overflow-hidden rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
        <BrandLockup variant="login" />
        <form action={signIn} className="p-8 pt-6">
          <h1 className="text-2xl font-semibold text-center">Đăng nhập quản trị</h1>
          <p className="mt-2 text-sm text-center text-[var(--tlkv-muted)]">
            Chỉ tài khoản admin mới được bán hàng, nhập kho và xem sổ tồn.
          </p>
          {params.error ? (
            <p className="mt-4 rounded-lg bg-[var(--tlkv-red-soft)] px-3 py-2 text-sm text-[var(--tlkv-red)]">
              {params.error}
            </p>
          ) : null}
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <label className="mt-6 block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className="mt-1.5 h-11 w-full rounded-lg border border-[var(--tlkv-line)] px-3 outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Mật khẩu
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 h-11 w-full rounded-lg border border-[var(--tlkv-line)] px-3 outline-none focus:border-[var(--tlkv-red)]"
            />
          </label>
          <button
            type="submit"
            className="mt-6 h-11 w-full rounded-lg bg-[var(--tlkv-brand-header-red)] font-semibold text-[var(--tlkv-brand-gold)] hover:opacity-90"
          >
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}
