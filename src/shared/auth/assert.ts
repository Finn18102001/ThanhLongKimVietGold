import { getPosSession } from "./session";
import { canAdminRead, canMutateAdminData, canStaffMutate } from "./permissions";

export async function assertAdminRead() {
  const session = await getPosSession();
  if (!session || !canAdminRead(session.role)) {
    throw new Error("Không có quyền xem dữ liệu quản trị.");
  }
  return session;
}

export async function assertAdminWrite() {
  const session = await getPosSession();
  if (!session || !canMutateAdminData(session.role)) {
    throw new Error("Tài khoản chỉ xem không được thay đổi dữ liệu quản trị.");
  }
  return session;
}

export async function assertStaffMutate() {
  const session = await getPosSession();
  if (!session || !canStaffMutate(session.role)) {
    throw new Error("Không có quyền thao tác.");
  }
  return session;
}
