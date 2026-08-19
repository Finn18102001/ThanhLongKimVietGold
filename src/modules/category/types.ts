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
