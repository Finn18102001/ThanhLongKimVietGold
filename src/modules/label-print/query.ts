import { createServerSupabase } from "@/shared/supabase/server";
import type {
  LabelHistoryPage,
  LabelHistoryQuery,
  LabelPiece,
  LabelPrintLogRow,
  LabelSkuOption,
  LabelStockSize,
} from "./types";

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function clampHistoryLimit(raw: number | undefined): number {
  const n = Number.isFinite(raw) ? Math.floor(raw as number) : 20;
  return Math.min(30, Math.max(2, n));
}

function mapPrintLogRow(row: {
  id: string;
  printed_at: string;
  msp: string;
  barcode: string;
  product_name: string;
  product_type: string | null;
  brand_name: string | null;
  klt_chi: number;
  klv_chi: number;
  labor_fee_dong: number;
  price_dong: number;
  print_qty: number;
  stock_size: string;
  actor_email: string;
  action_type: string;
  piece_id: string;
  sku_id: string;
  company_name: string;
  address_line: string;
}): LabelPrintLogRow {
  return {
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
  };
}

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
    .select("id, msp, barcode, type_code, serial_no, sku_id, created_at, created_by")
    .eq("sku_id", skuId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    msp: row.msp,
    barcode: row.barcode,
    typeCode: String(row.type_code ?? ""),
    serialNo: String(row.serial_no ?? row.msp),
    skuId: row.sku_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

/** Paginated print history — newest first. Does not load the full log. */
export async function listPrintHistoryPage(
  query: Partial<LabelHistoryQuery> = {},
): Promise<LabelHistoryPage> {
  const supabase = await createServerSupabase();
  const limit = clampHistoryLimit(query.limit);
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const dateFrom = (query.dateFrom ?? "").trim();
  const dateTo = (query.dateTo ?? "").trim();
  const productType = (query.productType ?? "").trim();
  const brand = (query.brand ?? "").trim();
  const productQuery = sanitizeSearch(query.productQuery ?? "");
  const actorQuery = sanitizeSearch(query.actorQuery ?? "");
  const codeQuery = sanitizeSearch(query.codeQuery ?? "");

  let builder = supabase
    .from("pos_label_print_log")
    .select(
      "id, printed_at, msp, barcode, product_name, product_type, brand_name, klt_chi, klv_chi, labor_fee_dong, price_dong, print_qty, stock_size, actor_email, action_type, piece_id, sku_id, company_name, address_line",
      { count: "exact" },
    )
    .order("printed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (dateFrom) builder = builder.gte("printed_at", `${dateFrom}T00:00:00+07:00`);
  if (dateTo) builder = builder.lte("printed_at", `${dateTo}T23:59:59.999+07:00`);
  if (productType) builder = builder.eq("product_type", productType);
  if (brand) builder = builder.eq("brand_name", brand);
  if (productQuery) builder = builder.ilike("product_name", `%${productQuery}%`);
  if (actorQuery) builder = builder.ilike("actor_email", `%${actorQuery}%`);
  if (codeQuery) {
    builder = builder.or(`msp.ilike.%${codeQuery}%,barcode.ilike.%${codeQuery}%`);
  }

  const { data, error, count } = await builder;
  if (error) throw new Error(error.message);

  return {
    items: (data ?? []).map(mapPrintLogRow),
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function pieceHasLabelPrint(pieceId: string): Promise<boolean> {
  if (!pieceId) return false;
  const supabase = await createServerSupabase();
  const { count, error } = await supabase
    .from("pos_label_print_log")
    .select("id", { count: "exact", head: true })
    .eq("piece_id", pieceId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
