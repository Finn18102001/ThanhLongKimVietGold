import { createServerSupabase } from "@/shared/supabase/server";
import type {
  ProductAdminListFilter,
  ProductAdminListPayload,
  ProductAdminPagePayload,
  ProductAdminRow,
  ProductAdminSummary,
  ProductBrandCategoryLink,
  ProductPriceRowOption,
  ProductTaxonomyOption,
} from "./types";
import { PRODUCT_DEFAULT_PAGE_SIZE, PRODUCT_PAGE_SIZE_OPTIONS } from "./types";

function mapTaxonomy(
  rows: Array<{ id: string; name: string | null; is_active?: boolean | null }> | null | undefined,
): ProductTaxonomyOption[] {
  return (rows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    isActive: row.is_active !== false,
  }));
}

function mapPriceRows(
  rows: Array<{
    id: string;
    product: string | null;
    brand: string | null;
    purity: string | null;
    sell?: number | string | null;
    buy?: number | string | null;
    is_visible_on_website: boolean | null;
  }> | null | undefined,
): ProductPriceRowOption[] {
  return (rows ?? []).map((row) => {
    const sell = Number(row.sell);
    const buy = Number(row.buy);
    return {
      id: String(row.id),
      label: [row.brand, row.product, row.purity].filter(Boolean).join(" · "),
      brandLabel: String(row.brand ?? "").trim(),
      productName: String(row.product ?? "").trim(),
      purity: row.purity != null ? String(row.purity) : null,
      sellDong: Number.isFinite(sell) && sell > 0 ? Math.round(sell) : null,
      buyDong: Number.isFinite(buy) && buy > 0 ? Math.round(buy) : null,
      isVisibleOnWebsite: row.is_visible_on_website === true,
    };
  });
}

function mapBrandCategories(
  rows: Array<{ brand_id: string; category_id: string }> | null | undefined,
): ProductBrandCategoryLink[] {
  return (rows ?? []).map((row) => ({
    brandId: String(row.brand_id),
    categoryId: String(row.category_id),
  }));
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBool(value: unknown): boolean | null {
  if (value == null) return null;
  return value === true;
}

function normalizePageSize(limit?: number): number {
  const n = Number(limit ?? PRODUCT_DEFAULT_PAGE_SIZE);
  if ((PRODUCT_PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) return n;
  return PRODUCT_DEFAULT_PAGE_SIZE;
}

function emptySummary(): ProductAdminSummary {
  return { total: 0, hiddenProduct: 0, hiddenPos: 0, orphan: 0 };
}

function mapAdminRow(raw: Record<string, unknown>): ProductAdminRow {
  const kind = raw.kind === "ORPHAN_SKU" ? "ORPHAN_SKU" : "PRODUCT";
  const source =
    raw.source === "ORDER" || raw.source === "ORPHAN_SKU" || raw.source === "CATALOG"
      ? raw.source
      : kind === "ORPHAN_SKU"
        ? "ORPHAN_SKU"
        : "CATALOG";
  return {
    rowId: String(raw.rowId ?? ""),
    kind,
    source,
    productId: raw.productId != null ? String(raw.productId) : null,
    skuId: raw.skuId != null ? String(raw.skuId) : null,
    sku: raw.sku != null ? String(raw.sku) : null,
    name: String(raw.name ?? ""),
    slug: raw.slug != null ? String(raw.slug) : null,
    brandId: raw.brandId != null ? String(raw.brandId) : null,
    brandName: raw.brandName != null ? String(raw.brandName) : null,
    categoryId: raw.categoryId != null ? String(raw.categoryId) : null,
    categoryName: raw.categoryName != null ? String(raw.categoryName) : null,
    productTypeId: raw.productTypeId != null ? String(raw.productTypeId) : null,
    productTypeName: raw.productTypeName != null ? String(raw.productTypeName) : null,
    priceRowId: raw.priceRowId != null ? String(raw.priceRowId) : null,
    priceText: String(raw.priceText ?? ""),
    priceNumeric: asNumber(raw.priceNumeric),
    weightChi: asNumber(raw.weightChi),
    goldAge: asNumber(raw.goldAge),
    imageUrl: raw.imageUrl != null ? String(raw.imageUrl) : null,
    sortOrder: raw.sortOrder == null ? null : Number(raw.sortOrder),
    isFeatured: raw.isFeatured === true,
    isBestSeller: raw.isBestSeller === true,
    isHot: raw.isHot === true,
    productActive: asBool(raw.productActive),
    skuActive: asBool(raw.skuActive),
    quantity: Number(raw.quantity ?? 0),
    lastCostDong: asNumber(raw.lastCostDong),
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : null,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : null,
  };
}

function normalizeFilter(filter: ProductAdminListFilter = {}) {
  const limit = normalizePageSize(filter.limit);
  const offset = Math.max(0, Number(filter.offset ?? 0) || 0);
  return {
    p_q: filter.q?.trim() || null,
    p_brand_id: filter.brandId || null,
    p_category_id: filter.categoryId || null,
    p_product_type_id: filter.productTypeId || null,
    p_source: filter.source || null,
    p_product_state: filter.productState || null,
    p_pos_state: filter.posState || null,
    p_limit: limit,
    p_offset: offset,
    p_product_id: filter.productId || null,
    p_sku_id: filter.skuId || null,
    limit,
    offset,
  };
}

export async function listProductAdminPage(
  filter: ProductAdminListFilter = {},
): Promise<ProductAdminPagePayload> {
  const supabase = await createServerSupabase();
  const params = normalizeFilter(filter);
  const result = await supabase.rpc("pos_list_product_admin", {
    p_q: params.p_q,
    p_brand_id: params.p_brand_id,
    p_category_id: params.p_category_id,
    p_product_type_id: params.p_product_type_id,
    p_source: params.p_source,
    p_product_state: params.p_product_state,
    p_pos_state: params.p_pos_state,
    p_limit: params.p_limit,
    p_offset: params.p_offset,
    p_product_id: params.p_product_id,
    p_sku_id: params.p_sku_id,
  });
  if (result.error) throw new Error(result.error.message);

  const payload = (result.data ?? {}) as {
    totalCount?: number;
    rows?: Record<string, unknown>[];
    summary?: Partial<ProductAdminSummary>;
  };
  const summary = payload.summary ?? {};
  return {
    rows: (payload.rows ?? []).map(mapAdminRow),
    totalCount: Number(payload.totalCount ?? 0),
    limit: params.limit,
    offset: params.offset,
    summary: {
      total: Number(summary.total ?? 0),
      hiddenProduct: Number(summary.hiddenProduct ?? 0),
      hiddenPos: Number(summary.hiddenPos ?? 0),
      orphan: Number(summary.orphan ?? 0),
    },
  };
}

export async function getProductAdminRow(
  productId: string | null,
  skuId: string | null,
): Promise<ProductAdminRow | null> {
  if (!productId && !skuId) return null;
  const page = await listProductAdminPage({
    productId: productId ?? null,
    skuId: skuId ?? null,
    limit: 1,
    offset: 0,
  });
  return page.rows[0] ?? null;
}

export async function listProductAdminData(
  filter: ProductAdminListFilter = {},
): Promise<ProductAdminListPayload> {
  const supabase = await createServerSupabase();
  const [page, brandsRes, categoriesRes, productTypesRes, brandCategoriesRes, priceRowsRes] =
    await Promise.all([
      listProductAdminPage({
        ...filter,
        limit: filter.limit ?? PRODUCT_DEFAULT_PAGE_SIZE,
        offset: filter.offset ?? 0,
      }),
      supabase.from("brands").select("id, name, is_active").order("sort_order").order("name"),
      supabase.from("categories").select("id, name, is_active").order("sort_order").order("name"),
      supabase.from("product_types").select("id, name, is_active").order("sort_order").order("name"),
      supabase.from("brand_categories").select("brand_id, category_id"),
      supabase
        .from("gold_price_rows")
        .select("id, product, brand, purity, sell, buy, is_visible_on_website")
        .order("sort_order"),
    ]);

  for (const result of [brandsRes, categoriesRes, productTypesRes, brandCategoriesRes, priceRowsRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    ...page,
    summary: page.summary.total > 0 ? page.summary : emptySummary(),
    brands: mapTaxonomy(brandsRes.data as Array<{ id: string; name: string | null; is_active?: boolean | null }>),
    categories: mapTaxonomy(
      categoriesRes.data as Array<{ id: string; name: string | null; is_active?: boolean | null }>,
    ),
    productTypes: mapTaxonomy(
      productTypesRes.data as Array<{ id: string; name: string | null; is_active?: boolean | null }>,
    ),
    brandCategories: mapBrandCategories(
      brandCategoriesRes.data as Array<{ brand_id: string; category_id: string }>,
    ),
    priceRows: mapPriceRows(
      priceRowsRes.data as Array<{
        id: string;
        product: string | null;
        brand: string | null;
        purity: string | null;
        sell: number | string | null;
        buy: number | string | null;
        is_visible_on_website: boolean | null;
      }>,
    ),
  };
}
