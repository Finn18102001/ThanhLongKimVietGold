import type { Metadata } from "next";
import { BrandLockup } from "@/shared/brand/BrandLockup";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Đăng nhập",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--tlkv-bg)] px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-[12px] bg-white shadow-[var(--tlkv-shadow)]">
        <BrandLockup variant="login" />
        <LoginForm error={params.error} nextPath={nextPath} />
      </div>
    </div>
  );
}
