import { EmployeeDirectory } from "./EmployeeDirectory";
import { listStaff } from "./query";

export async function EmployeePage() {
  const initial = await listStaff({ limit: 50, offset: 0 });
  return <EmployeeDirectory initial={initial} />;
}
