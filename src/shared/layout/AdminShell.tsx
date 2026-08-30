"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowsClockwise, CalendarBlank } from "@phosphor-icons/react";
import { isNavActive, navForRole } from "./nav";
import { signOut } from "@/app/login/actions";
import { BrandLockup } from "@/shared/brand/BrandLockup";
import { GlobalSearch } from "@/shared/search/GlobalSearch";
import { roleLabel, type StaffRole } from "@/shared/auth/permissions";

export function AdminShell({
  children,
  businessDateLabel,
  userEmail,
  userName,
  role,
}: {
  children: ReactNode;
  businessDateLabel: string;
  userEmail: string;
  userName: string;
  role: StaffRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { main, admin } = navForRole(role);
  const showAdminSection = admin.length > 0;

  return (
    <div className="flex min-h-[100dvh] bg-[var(--tlkv-bg)]">
      <aside className="sticky top-0 flex h-[100dvh] w-[280px] shrink-0 flex-col border-r border-[var(--tlkv-line)] bg-white">
        <BrandLockup variant="sidebar" href={role === "STAFF" ? "/pos" : "/"} />

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          <ul className="space-y-0.5">
            {main.map((item) => {
              const active = isNavActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
                      active
                        ? "bg-[var(--tlkv-red-soft)] font-semibold text-[var(--tlkv-red)]"
                        : "font-medium text-[var(--tlkv-text)] hover:bg-[var(--tlkv-bg)]"
                    }`}
                  >
                    <Icon
                      size={18}
                      weight={active ? "bold" : "regular"}
                      className="shrink-0"
                    />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {showAdminSection ? (
            <>
              <p className="mt-5 mb-2 px-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--tlkv-faint)]">
                QUẢN TRỊ
              </p>
              <ul className="space-y-0.5">
                {admin.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
                          active
                            ? "bg-[var(--tlkv-red-soft)] font-semibold text-[var(--tlkv-red)]"
                            : "font-medium text-[var(--tlkv-text)] hover:bg-[var(--tlkv-bg)]"
                        }`}
                      >
                        <Icon
                          size={18}
                          weight={active ? "bold" : "regular"}
                          className="shrink-0"
                        />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--tlkv-line)] bg-white px-6">
          <GlobalSearch />

          <div className="flex items-center gap-2.5 border-l border-[var(--tlkv-line)] pl-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tlkv-red)] text-sm font-semibold text-white">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold">{userName}</p>
              <p className="truncate text-[11px] text-[var(--tlkv-muted)]">
                {roleLabel(role)}
                {userEmail ? ` · ${userEmail}` : ""}
              </p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="h-9 rounded-lg border border-[var(--tlkv-line)] px-2.5 text-[12px] font-medium hover:bg-[var(--tlkv-bg)]"
              >
                Thoát
              </button>
            </form>
          </div>

          <div className="flex items-center gap-2 border-l border-[var(--tlkv-line)] pl-4">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 text-[13px] font-medium">
              <CalendarBlank size={16} className="text-[var(--tlkv-muted)]" />
              {businessDateLabel}
            </div>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="flex h-10 items-center gap-2 rounded-lg bg-[var(--tlkv-red)] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--tlkv-red-hover)] active:scale-[0.98]"
            >
              <ArrowsClockwise size={16} />
              Làm mới
            </button>
          </div>
        </header>

        <main className="flex-1 px-6 py-5">{children}</main>

        <footer className="flex items-center justify-between border-t border-[var(--tlkv-line)] px-6 py-3 text-[12px] text-[var(--tlkv-muted)]">
          <p>© 2026 Thăng Long Kim Việt. All rights reserved.</p>
          <p>Phiên bản 1.0.0</p>
        </footer>
      </div>
    </div>
  );
}
