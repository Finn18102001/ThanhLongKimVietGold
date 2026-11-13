import { createServerSupabase } from "@/shared/supabase/server";
import type { TaxonomyOverview } from "./types";

/**
 * Read-only view of the catalog model managed in website /admin:
 * brands, categories (linked via brand_categories) and product types, with product counts.
 */
export async function getTaxonomyOverview(): Promise<TaxonomyOverview> {
  const supabase = await createServerSupabase();
  const [brands, categories, types, links, products] = await Promise.all([
    supabase.from("brands").select("id, name, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("categories").select("id, name, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("product_types").select("id, name, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("brand_categories").select("brand_id, category_id"),
    supabase.from("products").select("brand_id, category_id, product_type_id"),
  ]);
  for (const result of [brands, categories, types, links, products]) {
    if (result.error) throw new Error(result.error.message);
  }

  const count = (key: "brand_id" | "category_id" | "product_type_id", id: string) =>
    (products.data ?? []).filter((row) => row[key] === id).length;
  const brandName = new Map((brands.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const categoryName = new Map((categories.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const linkRows = (links.data ?? []).map((row) => ({
    brandId: String(row.brand_id),
    categoryId: String(row.category_id),
  }));

  return {
    brands: (brands.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      isActive: Boolean(row.is_active),
      productCount: count("brand_id", String(row.id)),
      linked: linkRows
        .filter((link) => link.brandId === String(row.id))
        .map((link) => categoryName.get(link.categoryId) ?? "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi")),
    })),
    categories: (categories.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      isActive: Boolean(row.is_active),
      productCount: count("category_id", String(row.id)),
      linked: linkRows
        .filter((link) => link.categoryId === String(row.id))
        .map((link) => brandName.get(link.brandId) ?? "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi")),
    })),
    productTypes: (types.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      isActive: Boolean(row.is_active),
      productCount: count("product_type_id", String(row.id)),
      linked: [],
    })),
  };
}
