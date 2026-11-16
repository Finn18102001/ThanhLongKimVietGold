export type ProductAdminKind = "PRODUCT" | "ORPHAN_SKU";

export type ProductAdminSource = "CATALOG" | "ORDER" | "ORPHAN_SKU";

export type ProductTaxonomyOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ProductBrandCategoryLink = {
  brandId: string;
  categoryId: string;
};

export type ProductPriceRowOption = {
  id: string;
  label: string;
  brandLabel: string;
  productName: string;
  purity: string | null;
  sellDong: number | null;
  buyDong: number | null;
  isVisibleOnWebsite: boolean;
};

export type ProductLinkedSku = {
  skuId: string;
  sku: string;
  isActive: boolean;
  isOrderJewelry: boolean;
  quantity: number;
  lastCostDong: number | null;
};

export type ProductAdminRow = {
  rowId: string;
  kind: ProductAdminKind;
  source: ProductAdminSource;
  productId: string | null;
  skuId: string | null;
  sku: string | null;
  name: string;
  slug: string | null;
  brandId: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  productTypeId: string | null;
  productTypeName: string | null;
  priceRowId: string | null;
  priceText: string;
  priceNumeric: number | null;
  weightChi: number | null;
  goldAge: number | null;
  imageUrl: string | null;
  sortOrder: number | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  isHot: boolean;
  productActive: boolean | null;
  skuActive: boolean | null;
  quantity: number;
  lastCostDong: number | null;
  updatedAt: string | null;
  createdAt: string | null;
};

export type ProductAdminDetail = ProductAdminRow & {
  linkedSku: ProductLinkedSku | null;
  stockTransactionCount: number;
  labelPieceCount: number;
  hasSalesHistory: boolean;
  hasBuyHistory: boolean;
};

export type ProductAdminSummary = {
  total: number;
  hiddenProduct: number;
  hiddenPos: number;
  orphan: number;
};

export type ProductAdminListFilter = {
  q?: string;
  brandId?: string;
  categoryId?: string;
  productTypeId?: string;
  source?: "" | ProductAdminSource;
  productState?: "" | "active" | "hidden";
  posState?: "" | "visible" | "hidden" | "none";
  limit?: number;
  offset?: number;
  productId?: string | null;
  skuId?: string | null;
};

export type ProductAdminPagePayload = {
  rows: ProductAdminRow[];
  totalCount: number;
  limit: number;
  offset: number;
  summary: ProductAdminSummary;
};

export type ProductAdminListPayload = ProductAdminPagePayload & {
  brands: ProductTaxonomyOption[];
  categories: ProductTaxonomyOption[];
  productTypes: ProductTaxonomyOption[];
  brandCategories: ProductBrandCategoryLink[];
  priceRows: ProductPriceRowOption[];
};

export type ProductFormInput = {
  name: string;
  brandId: string;
  categoryId: string | null;
  productTypeId: string | null;
  priceRowId: string | null;
  priceText: string;
  weightChi: number | null;
  goldAge: number | null;
  imageUrl: string;
  isFeatured: boolean;
  isBestSeller: boolean;
  isHot: boolean;
  isActive: boolean;
};

export type ProductSaveResult = {
  row: ProductAdminRow;
  mode: "create" | "update";
};

export const PRODUCT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const PRODUCT_DEFAULT_PAGE_SIZE = 20;
