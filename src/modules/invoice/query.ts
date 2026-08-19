import { createServerSupabase } from "@/shared/supabase/server";
import type {
  InvoiceDetail,
  InvoiceLine,
  InvoiceListFilter,
  InvoiceListPage,
  InvoiceListRow,
} from "./types";

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function mapListRow(invoice: {
  id: string;
  invoice_no: string;
  status: string;
  total_dong: number | string;
  issued_at: string;
  actor_email: string;
  pos_customers:
    | { name: string; phone: string; customer_no: string | null; is_walk_in: boolean | null }
    | { name: string; phone: string; customer_no: string | null; is_walk_in: boolean | null }[]
    | null;
  pos_sales:
    | { sale_no: string; payment_method: string; actor_email: string; status: string }
    | { sale_no: string; payment_method: string; actor_email: string; status: string }[]
    | null;
}): InvoiceListRow {
  const customer = firstEmbed(invoice.pos_customers);
  const sale = firstEmbed(invoice.pos_sales);
  return {
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    status: invoice.status,
    totalDong: Number(invoice.total_dong),
    issuedAt: invoice.issued_at,
    actorEmail: invoice.actor_email,
    customerName: customer?.name ?? "Khách lẻ",
    customerPhone: customer?.phone ?? "",
    customerNo: customer?.customer_no ?? null,
    isWalkIn: Boolean(customer?.is_walk_in),
    paymentMethod: sale?.payment_method ?? "",
    saleNo: sale?.sale_no ?? "",
    saleStatus: sale?.status ?? "",
  };
}

export async function listInvoices(filter: InvoiceListFilter = {}): Promise<InvoiceListPage> {
  const supabase = await createServerSupabase();
  const limit = Math.min(Math.max(filter.limit ?? 5, 1), 50);
  const offset = Math.max(filter.offset ?? 0, 0);
  const query = sanitizeSearch(filter.query ?? "");
  const paymentMethod = filter.paymentMethod ?? null;
  const from = filter.from || null;
  const to = filter.to || null;

  const saleSelect = paymentMethod
    ? "pos_sales!inner(sale_no, payment_method, actor_email, status)"
    : "pos_sales(sale_no, payment_method, actor_email, status)";

  let builder = supabase
    .from("pos_invoices")
    .select(
      `id, invoice_no, total_dong, issued_at, status, actor_email, customer_id, ${saleSelect}, pos_customers(name, phone, customer_no, is_walk_in)`,
      { count: "exact" },
    )
    .order("issued_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) builder = builder.gte("issued_at", `${from}T00:00:00+07:00`);
  if (to) builder = builder.lte("issued_at", `${to}T23:59:59.999+07:00`);
  if (paymentMethod) builder = builder.eq("pos_sales.payment_method", paymentMethod);

  if (query) {
    const { data: customers, error: customerError } = await supabase
      .from("pos_customers")
      .select("id")
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%,customer_no.ilike.%${query}%`)
      .limit(50);
    if (customerError) throw new Error(customerError.message);
    const ids = (customers ?? []).map((row) => row.id);
    if (ids.length > 0) {
      builder = builder.or(`invoice_no.ilike.%${query}%,customer_id.in.(${ids.join(",")})`);
    } else {
      builder = builder.ilike("invoice_no", `%${query}%`);
    }
  }

  const { data, error, count } = await builder;
  if (error) throw new Error(error.message);

  return {
    items: (data ?? []).map((row) => mapListRow(row)),
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function getInvoiceByNo(invoiceNo: string): Promise<InvoiceDetail | null> {
  const supabase = await createServerSupabase();
  const { data: invoice, error } = await supabase
    .from("pos_invoices")
    .select(
      "id, invoice_no, total_dong, issued_at, status, actor_email, sale_id, pos_customers(name, phone, address, customer_no, is_walk_in), pos_sales(sale_no, payment_method, actor_email, status, note)",
    )
    .eq("invoice_no", invoiceNo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!invoice) return null;

  const { data: items, error: itemError } = await supabase
    .from("pos_sale_items")
    .select(
      "sku_id, quantity, unit_price_dong, total_price_dong, weight_chi, pos_skus(sku, name, products!pos_skus_catalog_product_id_fkey(image))",
    )
    .eq("sale_id", invoice.sale_id);
  if (itemError) throw new Error(itemError.message);

  const customer = firstEmbed(invoice.pos_customers);
  const sale = firstEmbed(invoice.pos_sales);

  const lines: InvoiceLine[] = (items ?? []).map((item) => {
    const sku = firstEmbed(item.pos_skus);
    const product = firstEmbed(
      sku && "products" in sku
        ? (sku.products as { image: string | null } | { image: string | null }[] | null)
        : null,
    );
    return {
      skuId: item.sku_id,
      sku: sku && "sku" in sku ? String(sku.sku) : "",
      name: sku && "name" in sku ? String(sku.name) : "",
      quantity: Number(item.quantity),
      unitPriceDong: Number(item.unit_price_dong),
      totalPriceDong: Number(item.total_price_dong),
      weightChi: Number(item.weight_chi),
      imageUrl: product?.image || null,
    };
  });

  return {
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    status: invoice.status,
    totalDong: Number(invoice.total_dong),
    issuedAt: invoice.issued_at,
    actorEmail: invoice.actor_email,
    saleNo: sale?.sale_no ?? "",
    saleStatus: sale?.status ?? "",
    paymentMethod: sale?.payment_method ?? "",
    note: sale?.note ?? null,
    customerName: customer?.name ?? "Khách lẻ",
    customerPhone: customer?.phone ?? "",
    customerAddress: customer?.address ?? null,
    customerNo: customer?.customer_no ?? null,
    isWalkIn: Boolean(customer?.is_walk_in),
    lines,
  };
}
