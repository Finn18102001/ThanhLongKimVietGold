"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowsClockwise,
  Bell,
  CalendarBlank,
  ChatCircle,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { ADMIN_NAV, MAIN_NAV, isNavActive } from "./nav";
import { signOut } from "@/app/login/actions";

export function AdminShell({
  children,
  goldPriceSlot,
  businessDateLabel,
  userEmail,
  userName,
}: {
  children: ReactNode;
  goldPriceSlot: ReactNode;
  businessDateLabel: string;
  userEmail: string;
  userName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] bg-[var(--tlkv-bg)]">
      <aside className="sticky top-0 flex h-[100dvh] w-[264px] shrink-0 flex-col border-r border-[var(--tlkv-line)] bg-white">
        <div className="flex items-center gap-3 px-5 py-4">
          <Image
            src="/brand/logo-dragon.png"
            alt="Thăng Long Kim Việt"
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
            priority
          />
          <div className="leading-tight">
            <p className="text-[13px] font-bold tracking-[0.04em] text-[var(--tlkv-red)]">
              THĂNG LONG
            </p>
            <p className="text-[13px] font-bold tracking-[0.04em] text-[var(--tlkv-red)]">
              KIM VIỆT
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          <ul className="space-y-0.5">
            {MAIN_NAV.map((item) => {
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

          <p className="mt-5 mb-2 px-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--tlkv-faint)]">
            QUẢN TRỊ
          </p>
          <ul className="space-y-0.5">
            {ADMIN_NAV.map((item) => {
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
        </nav>

        <div className="px-3 pb-4">{goldPriceSlot}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--tlkv-line)] bg-white px-6">
          <label className="relative min-w-[220px] flex-1">
            <MagnifyingGlass
              size={18}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--tlkv-faint)]"
            />
            <input
              type="search"
              placeholder="Tìm kiếm sản phẩm, hóa đơn, khách hàng..."
              className="h-10 w-full rounded-full border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] pr-4 pl-10 text-sm text-[var(--tlkv-text)] outline-none placeholder:text-[var(--tlkv-faint)] focus:border-[var(--tlkv-red)] focus:bg-white"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Thông báo"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-[var(--tlkv-text)] hover:bg-[var(--tlkv-bg)]"
            >
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--tlkv-red)] px-1 text-[10px] font-bold text-white">
                12
              </span>
            </button>
            <button
              type="button"
              aria-label="Tin nhắn"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--tlkv-text)] hover:bg-[var(--tlkv-bg)]"
            >
              <ChatCircle size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2.5 border-l border-[var(--tlkv-line)] pl-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tlkv-red)] text-sm font-semibold text-white">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="leading-tight">
              <p className="text-[13px] font-semibold">{userName}</p>
              <p className="max-w-[140px] truncate text-[11px] text-[var(--tlkv-muted)]">
                {userEmail || "Quản trị viên"}
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
