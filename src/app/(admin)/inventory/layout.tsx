import type { ReactNode } from "react";
import { InventorySubnav } from "@/modules/inventory/components/InventorySubnav";

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <InventorySubnav />
      {children}
    </div>
  );
}
