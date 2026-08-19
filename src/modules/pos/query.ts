import { createServerSupabase } from "@/shared/supabase/server";
import { browseGroupFromProduct, type PosCatalogItem } from "./types";

type ProductEmbed = { image: string | null; category: string | null } | { image: string | null; category: string | null }[] | null;

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listPosCatalog(): Promise<PosCatalogItem[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select(
      "id, sku, name, weight_chi, board_unit_chi, labor_fee_dong, gold_price_rows!pos_skus_price_row_id_fkey(sell), pos_inventory_stock(quantity), products!pos_skus_catalog_product_id_fkey(image, category)",
    )
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const price = firstEmbed(row.gold_price_rows);
    const stock = firstEmbed(row.pos_inventory_stock);
    const product = firstEmbed(row.products as ProductEmbed);
    const sell = price?.sell === undefined ? null : Number(price.sell);
    const unitPriceDong =
      sell && sell > 0
        ? Math.round(sell * (Number(row.weight_chi) / Number(row.board_unit_chi))) +
          Number(row.labor_fee_dong)
        : null;
    const category = product?.category ?? "Khác";
    return {
      skuId: row.id,
      sku: row.sku,
      name: row.name,
      quantity: Number(stock?.quantity ?? 0),
      unitPriceDong,
      imageUrl: product?.image || null,
      category,
      browseGroup: browseGroupFromProduct(row.name, category),
    };
  });
}
