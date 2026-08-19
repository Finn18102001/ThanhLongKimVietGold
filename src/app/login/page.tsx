import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--tlkv-bg)] px-4">
      <form
        action={signIn}
        className="w-full max-w-md rounded-[12px] bg-white p-8 shadow-[var(--tlkv-shadow)]"
      >
        <p className="text-[13px] font-bold tracking-[0.08em] text-[var(--tlkv-red)]">
          THĂNG LONG KIM VIỆT
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Đăng nhập quản trị</h1>
        <p className="mt-2 text-sm text-[var(--tlkv-muted)]">
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
          className="mt-6 h-11 w-full rounded-lg bg-[var(--tlkv-red)] font-semibold text-white hover:bg-[var(--tlkv-red-hover)]"
        >
          Đăng nhập
        </button>
      </form>
    </div>
  );
}
