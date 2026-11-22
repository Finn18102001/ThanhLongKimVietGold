import type { ReactNode } from "react";
import { InventorySubnav } from "@/modules/inventory/components/InventorySubnav";
import { getEmployeeCashAccess } from "@/modules/fund-cash/query";
import { getEmployeeGoldAccess } from "@/modules/fund-gold/query";
import { isEmployeeFundEnabled } from "@/modules/settings/query";

export default async function InventoryLayout({ children }: { children: ReactNode }) {
  let fundStaffRestricted = false;
  try {
    const flagOn = await isEmployeeFundEnabled();
    if (flagOn) {
      const [cash, gold] = await Promise.all([
        getEmployeeCashAccess(),
        getEmployeeGoldAccess(),
      ]);
      const isAdmin = cash.isAdmin || gold.isAdmin;
      const isFundStaff =
        Boolean(cash.staffAccountId || gold.staffAccountId) && !isAdmin;
      fundStaffRestricted = isFundStaff;
    }
  } catch {
    fundStaffRestricted = false;
  }

  return (
    <div className="flex flex-col gap-4">
      <InventorySubnav fundStaffRestricted={fundStaffRestricted} />
      {children}
    </div>
  );
}
