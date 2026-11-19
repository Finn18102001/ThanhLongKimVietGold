import { redirect } from "next/navigation";
import { getPosSession } from "@/shared/auth/session";
import { canAdminRead, canMutateAdminData, roleHomePath } from "@/shared/auth/permissions";
import {
  EMPLOYEE_FUND_FLAG_KEY,
  type EmployeeFundFlagState,
} from "@/shared/lib/feature-flags";
import { getEmployeeFundFlagState } from "./query";
import { SettingsWorkspace } from "./SettingsWorkspace";

const FALLBACK_FLAG: EmployeeFundFlagState = {
  enabled: false,
  dbEnabled: false,
  forceOff: false,
  updatedAt: null,
  updatedBy: null,
};

export async function SettingsPage() {
  const session = await getPosSession();
  if (!session || !canAdminRead(session.role)) {
    redirect(roleHomePath(session?.role ?? "STAFF"));
  }

  let initialFlag = FALLBACK_FLAG;
  try {
    initialFlag = await getEmployeeFundFlagState();
  } catch {
    initialFlag = {
      ...FALLBACK_FLAG,
      updatedBy: `fallback:${EMPLOYEE_FUND_FLAG_KEY}`,
    };
  }

  return (
    <SettingsWorkspace
      initialFlag={initialFlag}
      canMutate={canMutateAdminData(session.role)}
    />
  );
}
