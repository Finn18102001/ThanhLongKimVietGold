import { redirect } from "next/navigation";
import { canAdminRead, canMutateAdminData, roleHomePath } from "@/shared/auth/permissions";
import { getPosSession } from "@/shared/auth/session";
import { listProductAdminData } from "./query";
import { ProductWorkspace } from "./ProductWorkspace";

export async function ProductPage() {
  const session = await getPosSession();
  if (!session || !canAdminRead(session.role)) {
    redirect(roleHomePath(session?.role ?? "STAFF"));
  }

  const initial = await listProductAdminData();
  return <ProductWorkspace initial={initial} canMutate={canMutateAdminData(session.role)} />;
}
