import { getWalkInCustomer } from "@/modules/customer/query";
import { PosTerminal } from "./PosTerminal";
import { listPosCatalog } from "./query";

export async function PosPage() {
  const [catalog, walkIn] = await Promise.all([listPosCatalog(), getWalkInCustomer()]);
  return <PosTerminal catalog={catalog} walkIn={walkIn} />;
}
