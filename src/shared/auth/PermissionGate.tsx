"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AccessDenied } from "@/shared/auth/AccessDenied";
import { canAccessPath, roleHomePath, type StaffRole } from "@/shared/auth/permissions";

export function PermissionGate({
  role,
  children,
}: {
  role: StaffRole;
  children: ReactNode;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    if (role === "STAFF" && (pathname === "/" || pathname === "")) {
      router.replace(roleHomePath("STAFF"));
    }
  }, [pathname, role, router]);

  if (role === "STAFF" && (pathname === "/" || pathname === "")) {
    return (
      <div className="py-16 text-center text-[13px] text-[var(--tlkv-muted)]">
        Đang chuyển tới quầy bán hàng...
      </div>
    );
  }

  if (!canAccessPath(role, pathname)) {
    return <AccessDenied role={role} />;
  }

  return children;
}
