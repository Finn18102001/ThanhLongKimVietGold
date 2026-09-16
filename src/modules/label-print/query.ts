import { createServerSupabase } from "@/shared/supabase/server";
import type { LabelPiece, LabelPrintLogRow, LabelSkuOption, LabelStockSize } from "./types";

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function unitPrice(
  sell: number | null,
  weightChi: number,
  boardUnitChi: number,
  labor: number,
): number | null {
  if (sell === null || sell <= 0 || boardUnitChi <= 0) return null;
  return Math.round(sell * (weightChi / boardUnitChi)) + labor;
}

export async function listLabelSkus(): Promise<LabelSkuOption[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select(
      "id, sku, name, brand_id, weight_chi, board_unit_chi, labor_fee_dong, gold_price_rows!pos_skus_price_row_id_fkey(sell), pos_inventory_stock(quantity), products!pos_skus_catalog_product_id_fkey(category), brands!pos_skus_brand_id_fkey(name)",
    )
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const price = firstEmbed(row.gold_price_rows as { sell: number } | { sell: number }[] | null);
    const stock = firstEmbed(
      row.pos_inventory_stock as { quantity: number } | { quantity: number }[] | null,
    );
    const product = firstEmbed(
      row.products as { category: string | null } | { category: string | null }[] | null,
    );
    const brand = firstEmbed(row.brands as { name: string } | { name: string }[] | null);
    return {
      skuId: row.id,
      sku: row.sku,
      name: row.name,
      category: product?.category ?? "Khác",
      brandName: brand?.name ?? null,
      weightChi: Number(row.weight_chi),
      laborFeeDong: Number(row.labor_fee_dong ?? 0),
      unitPriceDong: unitPrice(
        price?.sell === undefined ? null : Number(price.sell),
        Number(row.weight_chi),
        Number(row.board_unit_chi),
        Number(row.labor_fee_dong ?? 0),
      ),
      stockQty: Number(stock?.quantity ?? 0),
    };
  });
}

export async function listPiecesForSku(skuId: string): Promise<LabelPiece[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_label_pieces")
    .select("id, msp, barcode, sku_id, created_at, created_by")
    .eq("sku_id", skuId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    msp: row.msp,
    barcode: row.barcode,
    skuId: row.sku_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

export async function listPrintHistory(limit = 300): Promise<LabelPrintLogRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_label_print_log")
    .select(
      "id, printed_at, msp, barcode, product_name, product_type, brand_name, klt_chi, klv_chi, labor_fee_dong, price_dong, print_qty, stock_size, actor_email, action_type, piece_id, sku_id, company_name, address_line",
    )
    .order("printed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    printedAt: row.printed_at,
    msp: row.msp,
    barcode: row.barcode,
    productName: row.product_name,
    productType: row.product_type || "—",
    brandName: row.brand_name || "—",
    kltChi: Number(row.klt_chi),
    klvChi: Number(row.klv_chi),
    laborFeeDong: Number(row.labor_fee_dong),
    priceDong: Number(row.price_dong),
    printQty: Number(row.print_qty),
    stockSize: row.stock_size as LabelStockSize,
    actorEmail: row.actor_email,
    actionType: row.action_type === "REPRINT" ? "REPRINT" : "FIRST_PRINT",
    pieceId: row.piece_id,
    skuId: row.sku_id,
    companyName: row.company_name,
    addressLine: row.address_line,
  }));
}
