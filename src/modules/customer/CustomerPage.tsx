import { listCustomers } from "./query";
import { CustomerDirectory } from "./CustomerDirectory";

export async function CustomerPage() {
  const initial = await listCustomers({ limit: 12, offset: 0 });
  return <CustomerDirectory initial={initial} />;
}
