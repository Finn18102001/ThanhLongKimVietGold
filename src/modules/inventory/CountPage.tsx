import { getPosSession } from "@/shared/auth/session";
import { canMutateAdminData } from "@/shared/auth/permissions";
import { createServerSupabase } from "@/shared/supabase/server";
import { listStockCounts } from "./count-actions";
import { StockCountWorkspace } from "./components/StockCountWorkspace";
import type { StockCountListRow } from "./count-types";

export async function CountPage() {
  const session = await getPosSession();
  const supabase = await createServerSupabase();
  let initialList: { items: StockCountListRow[]; total: number } = { items: [], total: 0 };
  let categories: Array<{ id: string; name: string }> = [];

  try {
    initialList = await listStockCounts();
    const { data } = await supabase.rpc("pos_list_categories");
    const payload = data as { items: Array<{ id: string; name: string }> } | null;
    categories = payload?.items ?? [];
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
