import { listAuditLogs } from "./actions";
import { AuditDirectory } from "./AuditDirectory";
import type { AuditListPage } from "./types";

export async function AuditPage() {
  let initial: AuditListPage = { items: [], total: 0, limit: 20, offset: 0 };
  try {
    initial = await listAuditLogs({ limit: 20, offset: 0 });
  } catch {
    // Migration chưa apply
  }
  return <AuditDirectory initial={initial} />;
}
