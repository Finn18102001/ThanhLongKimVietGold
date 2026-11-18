import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData } from "@/shared/auth/permissions";
import { listStockCounts } from "./count-actions";
import { StockCountWorkspace } from "./components/StockCountWorkspace";
import type { StockCountListRow } from "./count-types";
import { listCategories, listProductTypes } from "./query";
import type { CategoryOption, ProductTypeOption } from "./types";

export async function CountPage() {
  const session = await getPosSession();
  let initialList: { items: StockCountListRow[]; total: number } = { items: [], total: 0 };
  let categories: CategoryOption[] = [];
  let productTypes: ProductTypeOption[] = [];

  try {
    [initialList, categories, productTypes] = await Promise.all([
      listStockCounts(100, 0),
      listCategories(),
      listProductTypes(),
    ]);
  } catch {
    // Migration chưa apply — UI vẫn render với danh sách rỗng.
  }

  return (
    <StockCountWorkspace
      initialList={initialList}
      categories={categories}
      productTypes={productTypes}
      canMutate={session ? canMutateAdminData(session.role) : false}
    />
  );
}
