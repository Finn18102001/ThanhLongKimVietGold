"use server";

import { searchCustomers } from "@/modules/customer/actions";
import { listInvoices } from "@/modules/invoice/query";
import { invoiceDetailPath } from "@/shared/navigation/routes";
import { createServerSupabase } from "@/shared/supabase/server";
import type { GlobalSearchResponse } from "./types";

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function empty(query: string): GlobalSearchResponse {
  return { query, products: [], customers: [], invoices: [] };
}

export async function globalSearch(raw: string): Promise<GlobalSearchResponse> {
  const query = sanitizeSearch(raw);
  if (query.length < 2) return empty(query);

  const supabase = await createServerSupabase();

  const [customers, invoices, productsResult] = await Promise.all([
    searchCustomers({ query, limit: 5, offset: 0 }),
    listInvoices({ query, limit: 5, offset: 0 }),
    supabase
      .from("pos_skus")
      .select("id, sku, name")
      .eq("is_active", true)
      .or(`sku.ilike.%${query}%,name.ilike.%${query}%`)
      .order("name")
      .limit(5),
  ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  const q = encodeURIComponent(query);

  return {
    query,
    products: (productsResult.data ?? []).map((row) => ({
      kind: "product" as const,
      id: row.id,
      sku: row.sku,
      name: row.name,
      href: `/pos?q=${encodeURIComponent(row.sku)}`,
    })),
    customers: customers.items.map((row) => ({
      kind: "customer" as const,
      id: row.id,
      name: row.name,
      subtitle: row.phone || row.customerNo,
      href: `/customers?q=${q}`,
    })),
    invoices: invoices.items.map((row) => ({
      kind: "invoice" as const,
      invoiceNo: row.invoiceNo,
      subtitle: row.customerName,
      href: invoiceDetailPath(row.invoiceNo),
    })),
  };
}
