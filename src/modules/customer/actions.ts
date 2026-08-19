"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { mapCustomer, mapCustomerDetail, mapCustomerList } from "./map";
import type {
  CustomerDetail,
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
  sort?: CustomerSort;
  limit?: number;
  offset?: number;
}): Promise<CustomerListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_customers", {
    p_query: input.query ?? "",
    p_group: input.group || null,
    p_sort: input.sort ?? "newest",
    p_limit: input.limit ?? 5,
    p_offset: input.offset ?? 0,
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
