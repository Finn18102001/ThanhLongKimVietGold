import { getPosSession } from "@/shared/auth/session";
import { canAdminRead } from "@/shared/auth/permissions";

export type InvoiceAccessScope = {
  email: string;
  seeAll: boolean;
};

/** Admin / ADMIN_VIEWER see all sale invoices; STAFF only own (created_by actor_email). */
export async function getInvoiceAccessScope(): Promise<InvoiceAccessScope> {
  const session = await getPosSession();
  if (!session) {
    throw new Error("Chưa đăng nhập.");
  }
  return {
    email: session.email.trim().toLowerCase(),
    seeAll: canAdminRead(session.role),
  };
}

export function assertActorOwnsInvoice(
  scope: InvoiceAccessScope,
  actorEmail: string | null | undefined,
): void {
  if (scope.seeAll) return;
  const owner = (actorEmail ?? "").trim().toLowerCase();
  if (!owner || owner !== scope.email) {
    throw new Error("Không có quyền xem hoặc thao tác hóa đơn của nhân viên khác.");
  }
}
