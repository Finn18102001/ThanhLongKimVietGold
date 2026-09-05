import { createServerSupabase } from "@/shared/supabase/server";
import type {
  InvoiceDetail,
  InvoiceLine,
  InvoiceListFilter,
  InvoiceListPage,
  InvoiceListRow,
  PaymentStatus,
  SalePaymentRecord,
  DocumentType,
} from "./types";

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function asPaymentStatus(
  raw: string | null | undefined,
  paidDong: number,
  remainingDong: number,
  totalDong: number,
): PaymentStatus {
  if (raw === "OVERDUE") return "OVERDUE";
  if (remainingDong > 0 && paidDong <= 0) return "UNPAID";
  if (remainingDong > 0 && paidDong > 0) return "PARTIALLY_PAID";
  if (remainingDong <= 0 && totalDong >= 0) return "PAID";
  if (raw === "UNPAID" || raw === "PARTIALLY_PAID" || raw === "PAID") {
    return raw;
  }
  return remainingDong > 0 ? "PARTIALLY_PAID" : "PAID";
}

type SaleEmbed = {
  sale_no: string;
  payment_method: string;
  actor_email: string;
  status: string;
  payment_status: string | null;
  paid_dong: number | string | null;
  remaining_dong: number | string | null;
  due_date: string | null;
  transaction_type?: string | null;
  fulfillment_status?: string | null;
  pickup_due_at?: string | null;
  operator_staff_id?: string | null;
};

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
  pos_sales: SaleEmbed | SaleEmbed[] | null;
}): InvoiceListRow {
  const customer = firstEmbed(invoice.pos_customers);
  const sale = firstEmbed(invoice.pos_sales);
  const totalDong = Number(invoice.total_dong);
  const paidDong = Number(sale?.paid_dong ?? 0);
  const remainingDong = Number(
    sale?.remaining_dong ?? Math.max(0, totalDong - paidDong),
  );
  return {
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    status: invoice.status,
    totalDong,
    paidDong,
    remainingDong,
    dueDate: sale?.due_date ?? null,
    paymentStatus: asPaymentStatus(sale?.payment_status, paidDong, remainingDong, totalDong),
    issuedAt: invoice.issued_at,
    actorEmail: invoice.actor_email,
    customerName: customer?.name ?? "Khách lẻ",
    customerPhone: customer?.phone ?? "",
    customerNo: customer?.customer_no ?? null,
    isWalkIn: Boolean(customer?.is_walk_in),
    paymentMethod: sale?.payment_method ?? "",
    saleNo: sale?.sale_no ?? "",
    saleStatus: sale?.status ?? "",
    transactionType: sale?.transaction_type === "PREORDER" ? "PREORDER" : "SALE",
    fulfillmentStatus: sale?.fulfillment_status ?? "DELIVERED",
    documentType: "SALE_TO_CUSTOMER",
  };
}

const SALE_COLS =
  "sale_no, payment_method, actor_email, status, payment_status, paid_dong, remaining_dong, due_date, transaction_type, fulfillment_status, pickup_due_at, operator_staff_id";

export async function listInvoices(filter: InvoiceListFilter = {}): Promise<InvoiceListPage> {
  const supabase = await createServerSupabase();
  const limit = Math.min(Math.max(filter.limit ?? 5, 1), 50);
  const offset = Math.max(filter.offset ?? 0, 0);
  const query = sanitizeSearch(filter.query ?? "");
  const paymentMethod = filter.paymentMethod ?? null;
  const paymentStatus = filter.paymentStatus ?? null;
  const transactionType = filter.transactionType ?? null;
  const fulfillment = filter.fulfillment ?? null;
  const from = filter.from || null;
  const to = filter.to || null;

  const needsInnerSale = Boolean(paymentMethod || paymentStatus || transactionType || fulfillment);
  const saleSelect = needsInnerSale
    ? `pos_sales!inner(${SALE_COLS})`
    : `pos_sales(${SALE_COLS})`;

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

  if (paymentStatus === "OVERDUE") {
    const today = new Date().toISOString().slice(0, 10);
    builder = builder
      .gt("pos_sales.remaining_dong", 0)
      .not("pos_sales.due_date", "is", null)
      .lt("pos_sales.due_date", today);
  } else if (paymentStatus) {
    builder = builder.eq("pos_sales.payment_status", paymentStatus);
  }

  if (transactionType) {
    builder = builder.eq("pos_sales.transaction_type", transactionType);
  }
  if (fulfillment === "UNFULFILLED") {
    builder = builder.in("pos_sales.fulfillment_status", ["UNFULFILLED", "READY"]);
  } else if (fulfillment === "FULFILLED") {
    builder = builder.eq("pos_sales.fulfillment_status", "FULFILLED");
  }

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
      `id, invoice_no, total_dong, issued_at, status, actor_email, sale_id, voided_at, voided_by, void_reason, pos_customers(name, phone, address, customer_no, is_walk_in, citizen_id, date_of_birth), pos_sales(${SALE_COLS}, note)`,
    )
    .eq("invoice_no", invoiceNo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!invoice) return null;

  const { data: items, error: itemError } = await supabase
    .from("pos_sale_items")
    .select(
      "sku_id, quantity, unit_price_dong, total_price_dong, weight_chi, product_name_snapshot, sku_snapshot, reference_unit_price_dong, price_adjustment_per_chi, pos_skus(sku, name, products!pos_skus_catalog_product_id_fkey(image), gold_price_rows!pos_skus_price_row_id_fkey(purity))",
    )
    .eq("sale_id", invoice.sale_id);
  if (itemError) throw new Error(itemError.message);

  type InvoiceCustomerEmbed = {
    name: string;
    phone: string;
    address: string | null;
    customer_no: string | null;
    is_walk_in: boolean | null;
    citizen_id: string | null;
    date_of_birth: string | null;
  };
  const customer = firstEmbed(
    invoice.pos_customers as InvoiceCustomerEmbed | InvoiceCustomerEmbed[] | null,
  );
  const sale = firstEmbed(invoice.pos_sales as SaleEmbed & { note: string | null } | (SaleEmbed & { note: string | null })[] | null);
  const totalDong = Number(invoice.total_dong);

  const lines: InvoiceLine[] = (items ?? []).map((item) => {
    const sku = firstEmbed(item.pos_skus);
    const product = firstEmbed(
      sku && "products" in sku
        ? (sku.products as { image: string | null } | { image: string | null }[] | null)
        : null,
    );
    const priceRow = firstEmbed(
      sku && "gold_price_rows" in sku
        ? (sku.gold_price_rows as { purity: string | null } | { purity: string | null }[] | null)
        : null,
    );
    return {
      skuId: item.sku_id,
      sku:
        (item as { sku_snapshot?: string }).sku_snapshot ||
        (sku && "sku" in sku ? String(sku.sku) : ""),
      name:
        (item as { product_name_snapshot?: string }).product_name_snapshot ||
        (sku && "name" in sku ? String(sku.name) : ""),
      quantity: Number(item.quantity),
      unitPriceDong: Number(item.unit_price_dong),
      totalPriceDong: Number(item.total_price_dong),
      weightChi: Number(item.weight_chi),
      purity: priceRow?.purity ? String(priceRow.purity) : null,
      imageUrl: product?.image || null,
    };
  });

  const paidDong = Number(sale?.paid_dong ?? 0);
  const remainingDong = Number(sale?.remaining_dong ?? Math.max(0, totalDong - paidDong));

  const { data: chargeRows } = await supabase
    .from("pos_sale_charges")
    .select("id, name, amount_dong, reason")
    .eq("sale_id", invoice.sale_id)
    .order("created_at", { ascending: true });

  let operatorName: string | null = null;
  if (sale?.operator_staff_id) {
    const { data: operator } = await supabase
      .from("pos_staff")
      .select("full_name")
      .eq("id", sale.operator_staff_id)
      .maybeSingle();
    operatorName = operator?.full_name ?? null;
  }

  return {
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    saleId: String(invoice.sale_id),
    status: invoice.status,
    totalDong,
    paidDong,
    remainingDong,
    dueDate: sale?.due_date ?? null,
    paymentStatus: asPaymentStatus(sale?.payment_status, paidDong, remainingDong, totalDong),
    issuedAt: invoice.issued_at,
    actorEmail: invoice.actor_email,
    saleNo: sale?.sale_no ?? "",
    saleStatus: sale?.status ?? "",
    paymentMethod: sale?.payment_method ?? "",
    note: sale && "note" in sale ? (sale.note as string | null) : null,
    customerName: customer?.name ?? "Khách lẻ",
    customerPhone: customer?.phone ?? "",
    customerAddress: customer?.address ?? null,
    customerCitizenId: customer?.citizen_id ?? null,
    customerDateOfBirth: customer?.date_of_birth ?? null,
    customerNo: customer?.customer_no ?? null,
    isWalkIn: Boolean(customer?.is_walk_in),
    lines,
    charges: (chargeRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      amountDong: Number(row.amount_dong),
      reason: row.reason,
    })),
    payments: await listSalePayments(String(invoice.sale_id)),
    transactionType: sale?.transaction_type === "PREORDER" ? "PREORDER" : "SALE",
    fulfillmentStatus: sale?.fulfillment_status ?? "DELIVERED",
    pickupDueAt: sale?.pickup_due_at ?? null,
    operatorStaffId: sale?.operator_staff_id ?? null,
    operatorName,
    voidedAt: (invoice as { voided_at?: string | null }).voided_at ?? null,
    voidedBy: (invoice as { voided_by?: string | null }).voided_by ?? null,
    voidReason: (invoice as { void_reason?: string | null }).void_reason ?? null,
  };
}

export async function listSalePayments(saleId: string): Promise<SalePaymentRecord[]> {
  if (!saleId) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_sale_payments", {
    p_sale_id: saleId,
  });
  if (error) {
    // Fallback direct read when RPC not yet deployed on an env.
    const { data: rows, error: rowError } = await supabase
      .from("pos_sale_payments")
      .select("id, sale_id, amount_dong, payment_method, paid_at, actor_email, note")
      .eq("sale_id", saleId)
      .order("paid_at", { ascending: true });
    if (rowError) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      id: row.id,
      saleId: row.sale_id,
      amountDong: Number(row.amount_dong),
      paymentMethod: row.payment_method,
      paidAt: row.paid_at,
      actorEmail: row.actor_email,
      note: row.note,
      receivedByName: row.actor_email.split("@")[0] ?? row.actor_email,
    }));
  }
  const items = (
    data as {
      items?: Array<{
        id: string;
        sale_id: string;
        amount_dong: number | string;
        payment_method: string;
        paid_at: string;
        actor_email: string;
        note: string | null;
        received_by_name?: string | null;
      }>;
    } | null
  )?.items;
  return (items ?? []).map((row) => ({
    id: row.id,
    saleId: row.sale_id,
    amountDong: Number(row.amount_dong),
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    actorEmail: row.actor_email,
    note: row.note,
    receivedByName: row.received_by_name ?? row.actor_email.split("@")[0] ?? row.actor_email,
  }));
}

function asDocumentType(raw: string): DocumentType {
  if (raw === "PURCHASE_FROM_CUSTOMER" || raw === "STOCK_RECEIPT" || raw === "SALE_TO_CUSTOMER") {
    return raw;
  }
  return "SALE_TO_CUSTOMER";
}

export async function listDocuments(filter: InvoiceListFilter = {}): Promise<InvoiceListPage> {
  const supabase = await createServerSupabase();
  const limit = Math.min(Math.max(filter.limit ?? 5, 1), 50);
  const offset = Math.max(filter.offset ?? 0, 0);
  const { data, error } = await supabase.rpc("pos_list_documents", {
    p_document_type: filter.documentType ?? null,
    p_payment_status: filter.paymentStatus ?? null,
    p_from: filter.from || null,
    p_to: filter.to || null,
    p_q: sanitizeSearch(filter.query ?? "") || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  const raw = data as {
    items?: Array<Record<string, unknown>>;
    total?: number;
    limit?: number;
    offset?: number;
  } | null;
  return {
    items: (raw?.items ?? []).map((row) => {
      const documentType = asDocumentType(String(row.documentType ?? "SALE_TO_CUSTOMER"));
      const totalDong = Number(row.totalDong ?? 0);
      const paidDong = Number(row.paidDong ?? 0);
      const remainingDong = Number(row.remainingDong ?? 0);
      return {
        id: String(row.id),
        invoiceNo: String(row.documentNo ?? ""),
        status: "ISSUED",
        totalDong,
        paidDong,
        remainingDong,
        dueDate: null,
        paymentStatus: asPaymentStatus(
          String(row.paymentStatus ?? ""),
          paidDong,
          remainingDong,
          totalDong,
        ),
        issuedAt: String(row.issuedAt ?? ""),
        actorEmail: "",
        customerName: String(row.partyName ?? ""),
        customerPhone: String(row.partyPhone ?? ""),
        customerNo: null,
        isWalkIn: false,
        paymentMethod: String(row.paymentMethod ?? ""),
        saleNo: String(row.refNo ?? ""),
        saleStatus: "COMPLETED",
        transactionType: "SALE" as const,
        fulfillmentStatus: "DELIVERED",
        documentType,
      };
    }),
    total: Number(raw?.total ?? 0),
    limit: Number(raw?.limit ?? limit),
    offset: Number(raw?.offset ?? offset),
  };
}

export async function exportDocuments(filter: InvoiceListFilter = {}): Promise<InvoiceListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_export_documents", {
    p_document_type: filter.documentType ?? null,
    p_payment_status: filter.paymentStatus ?? null,
    p_from: filter.from || null,
    p_to: filter.to || null,
    p_q: sanitizeSearch(filter.query ?? "") || null,
  });
  if (error) throw new Error(error.message);
  const raw = data as {
    items?: Array<Record<string, unknown>>;
    total?: number;
    limit?: number;
    offset?: number;
  } | null;
  return {
    items: (raw?.items ?? []).map((row) => {
      const documentType = asDocumentType(String(row.documentType ?? "SALE_TO_CUSTOMER"));
      const totalDong = Number(row.totalDong ?? 0);
      const paidDong = Number(row.paidDong ?? 0);
      const remainingDong = Number(row.remainingDong ?? 0);
      return {
        id: String(row.id),
        invoiceNo: String(row.documentNo ?? ""),
        status: "ISSUED",
        totalDong,
        paidDong,
        remainingDong,
        dueDate: null,
        paymentStatus: asPaymentStatus(
          String(row.paymentStatus ?? ""),
          paidDong,
          remainingDong,
          totalDong,
        ),
        issuedAt: String(row.issuedAt ?? ""),
        actorEmail: "",
        customerName: String(row.partyName ?? ""),
        customerPhone: String(row.partyPhone ?? ""),
        customerNo: null,
        isWalkIn: false,
        paymentMethod: String(row.paymentMethod ?? ""),
        saleNo: String(row.refNo ?? ""),
        saleStatus: "COMPLETED",
        transactionType: "SALE" as const,
        fulfillmentStatus: "DELIVERED",
        documentType,
      };
    }),
    total: Number(raw?.total ?? 0),
    limit: Number(raw?.limit ?? 0),
    offset: Number(raw?.offset ?? 0),
  };
}
