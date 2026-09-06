import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData } from "@/shared/auth/permissions";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { listStaff } from "./query";

export async function EmployeePage() {
  const session = await getPosSession();
  const initial = await listStaff({ limit: 50, offset: 0 });
  return (
    <EmployeeDirectory
      initial={initial}
      canMutate={session ? canMutateAdminData(session.role) : false}
    />
  );
}
