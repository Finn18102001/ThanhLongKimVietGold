import { createServerSupabase } from "@/shared/supabase/server";
import { DEPOSIT_COMPANY } from "./company";
import type {
  DepositDocPayload,
  DepositLine,
  DepositSaleBundle,
  DepositWorkflowStatus,
  SaleItemFulfillStatus,
} from "./types";

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asDong(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value !== "") return Math.trunc(Number(value));
  return 0;
}

function asItemStatus(raw: string | null | undefined): SaleItemFulfillStatus {
  if (
    raw === "IN_STOCK" ||
    raw === "BACKORDER" ||
    raw === "READY" ||
    raw === "PARTIAL" ||
    raw === "DELIVERED"
  ) {
    return raw;
  }
  return "IN_STOCK";
}

function asWorkflow(raw: string | null | undefined): DepositWorkflowStatus | null {
  if (
    raw === "AWAITING_AGREEMENT" ||
    raw === "AGREEMENT_CONFIRMED" ||
    raw === "SLIP_ISSUED" ||
    raw === "AWAITING_DELIVERY" ||
    raw === "COMPLETED" ||
    raw === "CANCELLED"
  ) {
    return raw;
  }
  return null;
}

function asPayload(raw: unknown): DepositDocPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as DepositDocPayload;
}

export async function getDepositSaleBundle(saleId: string): Promise<DepositSaleBundle | null> {
  const supabase = await createServerSupabase();
  const { data: sale, error } = await supabase
    .from("pos_sales")
    .select(
      `id, sale_no, status, payment_method, total_dong, paid_dong, remaining_dong, due_date,
       payment_status, transaction_type, fulfillment_status, pickup_due_at, note, actor_email,
       completed_at, created_at, operator_staff_id, customer_id,
       deposit_workflow_status, deposit_agreement_no, deposit_slip_no, delivery_receipt_no,
       deposit_delivery_place, deposit_price_locked, deposit_doc_payload,
       pos_customers(name, phone, address, citizen_id, tax_code)`,
    )
    .eq("id", saleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sale) return null;

  const { data: invoice } = await supabase
    .from("pos_invoices")
    .select("id, invoice_no, issued_at")
    .eq("sale_id", saleId)
    .maybeSingle();

  const { data: items, error: itemError } = await supabase
    .from("pos_sale_items")
    .select(
      `id, sku_id, quantity, unit_price_dong, total_price_dong, weight_chi,
       product_name_snapshot, sku_snapshot, item_status, qty_available_at_order, qty_delivered,
       pos_skus(sku, name, gold_price_rows!pos_skus_price_row_id_fkey(purity))`,
    )
    .eq("sale_id", saleId)
    .order("id", { ascending: true });
  if (itemError) throw new Error(itemError.message);

  const skuIds = (items ?? []).map((row) => String(row.sku_id));
  const stockMap: Record<string, number> = {};
  if (skuIds.length > 0) {
    const { data: stocks } = await supabase
      .from("pos_inventory_stock")
      .select("sku_id, quantity")
      .in("sku_id", skuIds);
    for (const row of stocks ?? []) {
      stockMap[String(row.sku_id)] = Number(row.quantity ?? 0);
    }
  }

  const { data: payRows } = await supabase
    .from("pos_sale_payments")
    .select("id, amount_dong, payment_method, paid_at, note")
    .eq("sale_id", saleId)
    .order("paid_at", { ascending: true });

  let operatorName: string | null = null;
  if (sale.operator_staff_id) {
    const { data: operator } = await supabase
      .from("pos_staff")
      .select("full_name")
      .eq("id", sale.operator_staff_id)
      .maybeSingle();
    operatorName = operator?.full_name ?? null;
  }

  type Cust = {
    name: string;
    phone: string;
    address: string | null;
    citizen_id: string | null;
    tax_code: string | null;
  };
  const customer = firstEmbed(sale.pos_customers as Cust | Cust[] | null);

  const lines: DepositLine[] = (items ?? []).map((item) => {
    const sku = firstEmbed(
      item.pos_skus as
        | { sku: string; name: string; gold_price_rows?: { purity: string | null } | { purity: string | null }[] }
        | { sku: string; name: string; gold_price_rows?: { purity: string | null } | { purity: string | null }[] }[]
        | null,
    );
    const priceRow = firstEmbed(sku?.gold_price_rows ?? null);
    const qty = Number(item.quantity);
    const weight = Number(item.weight_chi);
    return {
      id: String(item.id),
      skuId: String(item.sku_id),
      sku: String(item.sku_snapshot || sku?.sku || ""),
      name: String(item.product_name_snapshot || sku?.name || ""),
      quantity: qty,
      unitPriceDong: asDong(item.unit_price_dong),
      totalPriceDong: asDong(item.total_price_dong),
      weightChi: weight,
      totalWeightChi: weight * qty,
      purity: priceRow?.purity ? String(priceRow.purity) : null,
      itemStatus: asItemStatus(item.item_status),
      qtyAvailableAtOrder: Number(item.qty_available_at_order ?? 0),
      qtyDelivered: Number(item.qty_delivered ?? 0),
      currentStock: stockMap[String(item.sku_id)] ?? 0,
    };
  });

  const tx = String(sale.transaction_type ?? "SALE");
  return {
    saleId: String(sale.id),
    saleNo: String(sale.sale_no),
    invoiceId: invoice?.id ? String(invoice.id) : null,
    invoiceNo: invoice?.invoice_no ? String(invoice.invoice_no) : null,
    issuedAt: String(invoice?.issued_at || sale.completed_at || sale.created_at),
    actorEmail: String(sale.actor_email ?? ""),
    operatorName,
    transactionType: tx === "PREORDER" || tx === "DEPOSIT" ? tx : "SALE",
    fulfillmentStatus: String(sale.fulfillment_status ?? ""),
    paymentStatus: String(sale.payment_status ?? ""),
    paymentMethod: String(sale.payment_method ?? "CASH"),
    totalDong: asDong(sale.total_dong),
    paidDong: asDong(sale.paid_dong),
    remainingDong: asDong(sale.remaining_dong),
    dueDate: sale.due_date ?? null,
    pickupDueAt: sale.pickup_due_at ?? null,
    note: sale.note ?? null,
    customerName: customer?.name ?? "",
    customerPhone: customer?.phone ?? "",
    customerAddress: customer?.address ?? null,
    customerCitizenId: customer?.citizen_id ?? null,
    customerTaxCode: customer?.tax_code ?? null,
    depositWorkflowStatus: asWorkflow(sale.deposit_workflow_status),
    depositAgreementNo: sale.deposit_agreement_no ?? null,
    depositSlipNo: sale.deposit_slip_no ?? null,
    deliveryReceiptNo: sale.delivery_receipt_no ?? null,
    depositDeliveryPlace: sale.deposit_delivery_place ?? DEPOSIT_COMPANY.place,
    depositPriceLocked: sale.deposit_price_locked !== false,
    payload: asPayload(sale.deposit_doc_payload),
    lines,
    payments: (payRows ?? []).map((row) => ({
      id: String(row.id),
      amountDong: asDong(row.amount_dong),
      paymentMethod: String(row.payment_method),
      paidAt: String(row.paid_at),
      note: row.note ?? null,
    })),
  };
}
