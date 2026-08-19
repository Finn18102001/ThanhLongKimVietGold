"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { mapCustomer, mapCustomerDetail, mapCustomerDirectoryStats, mapCustomerList } from "./map";
import type {
  CustomerActivityFilter,
  CustomerDetail,
  CustomerDirectoryStats,
  CustomerInput,
  CustomerListPage,
  CustomerRecord,
  CustomerSort,
} from "./types";

function revalidateCustomerViews() {
  revalidatePath("/customers");
  revalidatePath("/pos");
}

function customerArgs(input: CustomerInput) {
  return {
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email ?? null,
    p_address: input.address ?? null,
    p_tax_code: input.taxCode ?? null,
    p_note: input.note ?? null,
    p_gender: input.gender ?? null,
    p_customer_group: input.customerGroup ?? "RETAIL",
    p_date_of_birth: input.dateOfBirth || null,
  };
}

export async function searchCustomers(input: {
  query?: string;
  group?: string | null;
  activity?: CustomerActivityFilter;
  sort?: CustomerSort;
  limit?: number;
  offset?: number;
}): Promise<CustomerListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_customers", {
    p_query: input.query ?? "",
    p_group: input.group || null,
    p_sort: input.sort ?? "newest",
    p_limit: input.limit ?? 20,
    p_offset: input.offset ?? 0,
    p_activity: input.activity || null,
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

export async function fetchCustomerDirectoryStats(): Promise<CustomerDirectoryStats> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_customer_directory_stats");
  if (error) throw new Error(error.message);
  return mapCustomerDirectoryStats(data as Parameters<typeof mapCustomerDirectoryStats>[0]);
}

export async function exportCustomers(input: {
  query?: string;
  group?: string | null;
  activity?: CustomerActivityFilter;
  sort?: CustomerSort;
}): Promise<CustomerListPage> {
  const first = await searchCustomers({ ...input, limit: 1, offset: 0 });
  const total = Math.min(first.total, 5000);
  if (total === 0) {
    return { items: [], total: 0, limit: 0, offset: 0 };
  }
  return searchCustomers({ ...input, limit: total, offset: 0 });
}

export async function fetchCustomer(id: string): Promise<CustomerDetail> {
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

export async function createCustomer(input: CustomerInput): Promise<CustomerRecord> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_create_customer", customerArgs(input));
  if (error) throw new Error(error.message);
  revalidateCustomerViews();
  return mapCustomer((data as { customer: Parameters<typeof mapCustomer>[0] }).customer);
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
): Promise<CustomerRecord> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_update_customer", {
    p_id: id,
    ...customerArgs(input),
  });
  if (error) throw new Error(error.message);
  revalidateCustomerViews();
  return mapCustomer((data as { customer: Parameters<typeof mapCustomer>[0] }).customer);
}

export async function deleteCustomer(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_delete_customer", { p_id: id });
  if (error) throw new Error(error.message);
  revalidateCustomerViews();
}
