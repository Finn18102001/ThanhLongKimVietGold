import { createServerSupabase } from "@/shared/supabase/server";
import type {
  LabelHistoryPage,
  LabelHistoryQuery,
  LabelPiece,
  LabelPrintLogRow,
  LabelProductType,
  LabelReceiveOptions,
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
  kld_chi?: number | null;
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
    kldChi: Number(row.kld_chi ?? 0),
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

const LABEL_SKU_COLUMNS =
  "id, sku, name, brand_id, weight_chi, board_unit_chi, labor_fee_dong, stone_weight_chi, stone_quantity, stone_unit_price_dong, stone_price_dong, is_market_gold, gold_price_rows!pos_skus_price_row_id_fkey(sell), products!pos_skus_catalog_product_id_fkey(category, gold_age, product_type_id), brands!pos_skus_brand_id_fkey(name)";
const LABEL_SKU_SELECT = `${LABEL_SKU_COLUMNS}, pos_inventory_stock(quantity)`;
/** Market gold SKUs are inactive by design; only those still in stock can be labelled. */
const LABEL_MARKET_SKU_SELECT = `${LABEL_SKU_COLUMNS}, pos_inventory_stock!inner(quantity)`;

type LabelSkuRow = {
  id: string;
  sku: string;
  name: string;
  weight_chi: number | string;
  board_unit_chi: number | string;
  labor_fee_dong: number | string | null;
  stone_weight_chi: number | string | null;
  stone_quantity: number | string | null;
  stone_unit_price_dong: number | string | null;
  stone_price_dong: number | string | null;
  is_market_gold: boolean | null;
  gold_price_rows: unknown;
  pos_inventory_stock: unknown;
  products: unknown;
  brands: unknown;
};

function mapLabelSku(row: LabelSkuRow): LabelSkuOption {
  const price = firstEmbed(row.gold_price_rows as { sell: number } | { sell: number }[] | null);
  const stock = firstEmbed(
    row.pos_inventory_stock as { quantity: number } | { quantity: number }[] | null,
  );
  type ProductEmbed = {
    category: string | null;
    gold_age: number | string | null;
    product_type_id: string | null;
  };
  const product = firstEmbed(row.products as ProductEmbed | ProductEmbed[] | null);
  const brand = firstEmbed(row.brands as { name: string } | { name: string }[] | null);
  const goldAge = product?.gold_age == null ? null : Number(product.gold_age);
  const isMarketGold = Boolean(row.is_market_gold);
  return {
    skuId: row.id,
    sku: row.sku,
    name: row.name,
    category: product?.category ?? (isMarketGold ? "Vàng thị trường" : "Khác"),
    brandName: brand?.name ?? null,
    productTypeId: product?.product_type_id ?? null,
    weightChi: Number(row.weight_chi),
    laborFeeDong: Number(row.labor_fee_dong ?? 0),
    unitPriceDong: unitPrice(
      price?.sell === undefined ? null : Number(price.sell),
      Number(row.weight_chi),
      Number(row.board_unit_chi),
      Number(row.labor_fee_dong ?? 0),
    ),
    stockQty: Number(stock?.quantity ?? 0),
    goldAge: goldAge != null && Number.isFinite(goldAge) ? goldAge : null,
    stoneWeightChi: Number(row.stone_weight_chi ?? 0),
    stoneQuantity: Number(row.stone_quantity ?? 0),
    stoneUnitPriceDong: Number(row.stone_unit_price_dong ?? 0),
    stonePriceDong: Number(row.stone_price_dong ?? 0),
    isMarketGold,
  };
}

export async function listLabelSkus(): Promise<LabelSkuOption[]> {
  const supabase = await createServerSupabase();
  const [active, market] = await Promise.all([
    supabase.from("pos_skus").select(LABEL_SKU_SELECT).eq("is_active", true).order("name"),
    supabase
      .from("pos_skus")
      .select(LABEL_MARKET_SKU_SELECT)
      .eq("is_active", false)
      .eq("is_market_gold", true)
      .gt("pos_inventory_stock.quantity", 0)
      .order("name"),
  ]);
  if (active.error) throw new Error(active.error.message);
  if (market.error) throw new Error(market.error.message);
  return [...((active.data ?? []) as LabelSkuRow[]), ...((market.data ?? []) as LabelSkuRow[])].map(mapLabelSku);
}

export async function getLabelSku(skuId: string): Promise<LabelSkuOption | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("pos_skus")
    .select(LABEL_SKU_SELECT)
    .eq("id", skuId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLabelSku(data as LabelSkuRow) : null;
}

export async function listLabelProductTypes(): Promise<LabelProductType[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("product_types")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? "") }));
}

export async function listLabelReceiveOptions(): Promise<LabelReceiveOptions> {
  const supabase = await createServerSupabase();
  const [brands, categories, priceRows, productTypes, links] = await Promise.all([
    supabase.rpc("pos_list_brands"),
    supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("gold_price_rows").select("id, product, brand, purity").order("sort_order"),
    listLabelProductTypes(),
    supabase.from("brand_categories").select("brand_id, category_id"),
  ]);
  if (brands.error) throw new Error(brands.error.message);
  if (categories.error) throw new Error(categories.error.message);
  if (priceRows.error) throw new Error(priceRows.error.message);
  if (links.error) throw new Error(links.error.message);

  const brandRows = (brands.data as Array<Record<string, unknown>> | null) ?? [];
  return {
    brands: brandRows
      .filter((row) => row.isActive !== false)
      .map((row) => ({ id: String(row.id), name: String(row.name ?? "") })),
    productTypes,
    brandCategories: (links.data ?? []).map((row) => ({
      brandId: String(row.brand_id),
      categoryId: String(row.category_id),
    })),
    categories: (categories.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
    })),
    priceRows: (priceRows.data ?? []).map((row) => ({
      id: String(row.id),
      brand: String(row.brand ?? ""),
      product: String(row.product ?? ""),
      purity: String(row.purity ?? ""),
    })),
  };
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
      "id, printed_at, msp, barcode, product_name, product_type, brand_name, klt_chi, klv_chi, kld_chi, labor_fee_dong, price_dong, print_qty, stock_size, actor_email, action_type, piece_id, sku_id, company_name, address_line",
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
