import { GoldManagementWorkspace } from "./components/GoldManagementWorkspace";
import { listGoldObligations } from "./query";

export async function GoldManagementPage() {
  const { rows, summary } = await listGoldObligations();
  return <GoldManagementWorkspace rows={rows} summary={summary} />;
}
