"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import type { AssignableSku, CategoryDetail, CategoryRecord } from "./types";

function revalidateCategories() {
  revalidatePath("/categories");
  revalidatePath("/inventory/count");
  revalidatePath("/audit");
}

function mapCategory(raw: Record<string, unknown>): CategoryRecord {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: raw.description ? String(raw.description) : null,
    status: raw.status as CategoryRecord["status"],
    displayOrder: Number(raw.display_order),
    productCount: Number(raw.product_count),
    createdAt: String(raw.created_at),
    updatedAt: String(raw.updated_at),
  };
}

function mapDetail(raw: Record<string, unknown>): CategoryDetail {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: raw.description ? String(raw.description) : null,
    status: raw.status as CategoryDetail["status"],
    displayOrder: Number(raw.display_order),
    skus: ((raw.skus ?? []) as Array<Record<string, unknown>>).map((sku) => ({
      skuId: String(sku.sku_id),
      sku: String(sku.sku),
      name: String(sku.name),
    })),
  };
}

export async function listCategories(): Promise<CategoryRecord[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_categories");
  if (error) throw new Error(error.message);
  const payload = data as { items: Array<Record<string, unknown>> };
  return payload.items.map(mapCategory);
}

export async function getCategory(id: string): Promise<CategoryDetail> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_category", { p_id: id });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Không tìm thấy danh mục");
  return mapDetail(data as Record<string, unknown>);
}

export async function searchAssignableSkus(query = ""): Promise<AssignableSku[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_assignable_skus", { p_query: query });
  if (error) throw new Error(error.message);
  const payload = data as { items: Array<Record<string, unknown>> };
  return payload.items.map((row) => ({
    skuId: String(row.sku_id),
    sku: String(row.sku),
    name: String(row.name),
  }));
}

export async function createCategory(input: {
  name: string;
  description?: string;
  status?: "ACTIVE" | "INACTIVE";
  displayOrder?: number;
  skuIds?: string[];
}) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_create_category", {
    p_name: input.name,
    p_description: input.description ?? null,
    p_status: input.status ?? "ACTIVE",
    p_display_order: input.displayOrder ?? 0,
    p_sku_ids: input.skuIds ?? [],
  });
  if (error) throw new Error(error.message);
  revalidateCategories();
  return mapDetail(data as Record<string, unknown>);
}

export async function updateCategory(
  id: string,
  input: {
    name: string;
    description?: string;
    status?: "ACTIVE" | "INACTIVE";
    displayOrder?: number;
    skuIds?: string[];
  },
) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_update_category", {
    p_id: id,
    p_name: input.name,
    p_description: input.description ?? null,
    p_status: input.status ?? "ACTIVE",
    p_display_order: input.displayOrder ?? 0,
    p_sku_ids: input.skuIds ?? [],
  });
  if (error) throw new Error(error.message);
  revalidateCategories();
  return mapDetail(data as Record<string, unknown>);
}

export async function deleteCategory(id: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_delete_category", { p_id: id });
  if (error) throw new Error(error.message);
  revalidateCategories();
}
