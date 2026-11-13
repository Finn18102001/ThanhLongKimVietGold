import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData } from "@/shared/auth/permissions";
import { listStockCounts } from "./count-actions";
import { StockCountWorkspace } from "./components/StockCountWorkspace";
import type { StockCountListRow } from "./count-types";
import { listCategories } from "./query";
import type { CategoryOption } from "./types";

export async function CountPage() {
  const session = await getPosSession();
  let initialList: { items: StockCountListRow[]; total: number } = { items: [], total: 0 };
  let categories: CategoryOption[] = [];

  try {
    [initialList, categories] = await Promise.all([listStockCounts(), listCategories()]);
  } catch {
    // Migration chưa apply — UI vẫn render với danh sách rỗng.
  }

  return (
    <StockCountWorkspace
      initialList={initialList}
      categories={categories}
      canMutate={session ? canMutateAdminData(session.role) : false}
    />
  );
}
