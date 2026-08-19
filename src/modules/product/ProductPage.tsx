import { ModulePlaceholder } from "@/shared/ui/ModulePlaceholder";

export function ProductPage() {
  return (
    <ModulePlaceholder
      moduleId="product"
      title="Sản phẩm"
      summary="Catalog / SKU tách khỏi tồn kho. POS lấy giá từ bảng giá hiện tại rồi snapshot vào dòng bán."
    />
  );
}
