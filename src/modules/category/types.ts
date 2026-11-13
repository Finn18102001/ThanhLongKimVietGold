export type CategoryRecord = {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  displayOrder: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CategoryDetail = {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  displayOrder: number;
  skus: Array<{ skuId: string; sku: string; name: string }>;
};

export type AssignableSku = {
  skuId: string;
  sku: string;
  name: string;
};

/** One row of the read-only catalog view (brand, category or product type). */
export type TaxonomyRow = {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
  /** Brand: linked category names. Category: linked brand names. Product type: empty. */
  linked: string[];
};

export type TaxonomyOverview = {
  brands: TaxonomyRow[];
  categories: TaxonomyRow[];
  productTypes: TaxonomyRow[];
};
