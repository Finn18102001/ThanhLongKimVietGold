import { HistoryWorkspace } from "./components/HistoryWorkspace";
import { searchLedger } from "./actions";

export async function HistoryPage() {
  const initial = await searchLedger({ limit: 50, offset: 0 });
  return <HistoryWorkspace initial={initial} />;
}
