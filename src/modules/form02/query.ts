import { createServerSupabase } from "@/shared/supabase/server";
import type { Form02Line, Form02ListFilter, Form02ListPage } from "./types";

function mapLine(row: Record<string, unknown>): Form02Line {
  return {
    stt: Number(row.stt ?? 0),
    buyId: String(row.buyId ?? ""),
    itemId: String(row.itemId ?? ""),
    buyNo: String(row.buyNo ?? ""),
    form02No: String(row.form02No ?? ""),
    status: String(row.status ?? ""),
    workflowStatus: row.workflowStatus == null ? null : String(row.workflowStatus),
    purchasedAt: String(row.purchasedAt ?? ""),
    sellerName: row.sellerName == null ? null : String(row.sellerName),
    sellerAddress: row.sellerAddress == null ? null : String(row.sellerAddress),
    sellerCitizenId: row.sellerCitizenId == null ? null : String(row.sellerCitizenId),
    sellerPhone: row.sellerPhone == null ? null : String(row.sellerPhone),
    productName: String(row.productName ?? ""),
    quantity: Number(row.quantity ?? 0),
    weightChi: Number(row.weightChi ?? 0),
    unitPriceDong: Number(row.unitPriceDong ?? 0),
    lineTotalDong: Number(row.lineTotalDong ?? 0),
    buyTotalDong: Number(row.buyTotalDong ?? 0),
    actorEmail: row.actorEmail == null ? null : String(row.actorEmail),
  };
}

function mapPage(data: unknown): Form02ListPage {
  const raw = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? raw.items.map((row) => mapLine(row as Record<string, unknown>)) : [];
  return {
    items,
    total: Number(raw.total ?? 0),
    limit: Number(raw.limit ?? 50),
    offset: Number(raw.offset ?? 0),
  };
}

export async function listForm02(filter: Form02ListFilter = {}): Promise<Form02ListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_form02", {
    p_from: filter.from || null,
    p_to: filter.to || null,
    p_doc_no: filter.docNo || null,
    p_seller: filter.seller || null,
    p_actor: filter.actor || null,
    p_limit: filter.limit ?? 50,
    p_offset: filter.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return mapPage(data);
}

export async function exportForm02(filter: Omit<Form02ListFilter, "limit" | "offset">): Promise<Form02ListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_export_form02", {
    p_from: filter.from || null,
    p_to: filter.to || null,
    p_doc_no: filter.docNo || null,
    p_seller: filter.seller || null,
    p_actor: filter.actor || null,
    p_limit: 5000,
  });
  if (error) throw new Error(error.message);
  return mapPage(data);
}
