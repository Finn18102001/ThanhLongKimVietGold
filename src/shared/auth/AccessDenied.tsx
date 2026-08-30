"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, LockSimple } from "@phosphor-icons/react";
import {
  HIDDEN_RELEASE_HREFS,
  roleHomePath,
  type StaffRole,
} from "@/shared/auth/permissions";

export function AccessDenied({ role }: { role: StaffRole }) {
  const pathname = usePathname() || "/";
  const home = roleHomePath(role);
  const isHiddenFeature = [...HIDDEN_RELEASE_HREFS].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-lg border-t-2 border-[var(--tlkv-red)] bg-white px-8 py-10 shadow-[var(--tlkv-shadow)]">
        <div className="flex items-center gap-3">
          <LockSimple size={22} className="text-[var(--tlkv-red)]" weight="bold" />
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--tlkv-faint)] uppercase">
            {isHiddenFeature ? "Chưa mở trong bản này" : "Không mở được mục này"}
          </p>
        </div>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-[var(--tlkv-text)]">
          {isHiddenFeature ? "Tính năng đang tạm ẩn" : "Mục dành cho quản trị"}
        </h1>
        <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-[var(--tlkv-muted)]">
          {isHiddenFeature
            ? "Mục này chưa phát hành trong bản hiện tại. Dùng các mục khác trên menu để tiếp tục công việc."
            : "Tài khoản nhân viên không xem doanh số, quản lý nhân viên hay nhật ký hệ thống. Dùng menu bên trái để vào các việc được giao."}
        </p>
        <Link
          href={home}
          className="mt-8 inline-flex h-11 items-center gap-2 bg-[var(--tlkv-red)] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--tlkv-red-hover)] active:scale-[0.98]"
        >
          Về màn hình làm việc
          <ArrowRight size={16} weight="bold" />
        </Link>
      </div>
    </div>
  );
}
