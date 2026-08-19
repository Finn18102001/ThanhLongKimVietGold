"use server";

import { createServerSupabase } from "@/shared/supabase/server";
import type { AuditListPage, AuditLogRow } from "./types";

function mapRow(raw: Record<string, unknown>): AuditLogRow {
  return {
    id: String(raw.id),
    createdAt: String(raw.created_at),
    actorEmail: String(raw.actor_email),
    action: String(raw.action),
    entityType: String(raw.entity_type),
    entityId: raw.entity_id ? String(raw.entity_id) : null,
    reason: raw.reason ? String(raw.reason) : null,
    payload: (raw.payload as Record<string, unknown> | null) ?? null,
  };
}

export async function listAuditLogs(input: {
  query?: string;
  module?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AuditListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_audit_logs", {
    p_query: input.query ?? "",
    p_module: input.module || null,
    p_from: input.from || null,
    p_to: input.to || null,
    p_limit: input.limit ?? 20,
    p_offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const payload = data as {
    items: Array<Record<string, unknown>>;
    total: number;
    limit: number;
    offset: number;
  };
  return {
    items: payload.items.map(mapRow),
    total: payload.total,
    limit: payload.limit,
    offset: payload.offset,
  };
}
