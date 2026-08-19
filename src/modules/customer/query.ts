import { createServerSupabase } from "@/shared/supabase/server";
import { mapCustomer, mapCustomerDetail, mapCustomerDirectoryStats, mapCustomerList } from "./map";
import type {
  CustomerActivityFilter,
  CustomerDetail,
  CustomerDirectoryStats,
  CustomerListPage,
  CustomerRecord,
  CustomerSort,
} from "./types";

export async function getCustomerDirectoryStats(): Promise<CustomerDirectoryStats> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_customer_directory_stats");
  if (error) throw new Error(error.message);
  return mapCustomerDirectoryStats(data as Parameters<typeof mapCustomerDirectoryStats>[0]);
}

export async function listCustomers(input?: {
  query?: string;
  group?: string | null;
  activity?: CustomerActivityFilter;
  sort?: CustomerSort;
  limit?: number;
  offset?: number;
}): Promise<CustomerListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_customers", {
    p_query: input?.query ?? "",
    p_group: input?.group || null,
    p_sort: input?.sort ?? "newest",
    p_limit: input?.limit ?? 20,
    p_offset: input?.offset ?? 0,
    p_activity: input?.activity || null,
  });
  if (error) throw new Error(error.message);
  return mapCustomerList(
    data as {
      items: Parameters<typeof mapCustomerList>[0]["items"];
      total: number;
      limit: number;
      offset: number;
    },
  );
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_customer", { p_id: id });
  if (error) throw new Error(error.message);
  return mapCustomerDetail(
    data as {
      customer: Parameters<typeof mapCustomerDetail>[0]["customer"];
      history: Parameters<typeof mapCustomerDetail>[0]["history"];
    },
  );
}

export async function getWalkInCustomer(): Promise<CustomerRecord> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_walk_in_customer");
  if (error) throw new Error(error.message);
  const payload = data as { customer: Parameters<typeof mapCustomer>[0] };
  return mapCustomer(payload.customer);
}
