export type PosCatalogItem = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceDong: number | null;
  imageUrl: string | null;
  category: string;
  browseGroup: string;
};

export type CartLine = {
  skuId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceDong: number;
  imageUrl: string | null;
};

export function browseGroupFromProduct(name: string, category: string | null): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("nhẫn")) return "Nhẫn";
  if (normalized.includes("bông lúa")) return "Bông lúa";
  if (normalized.includes("bông sen")) return "Bông Sen";
  if (normalized.includes("kim gia bảo")) return "Kim Gia Bảo";
  if (normalized.includes("rồng")) return "Vàng Rồng";
  return category?.trim() || "Khác";
}
