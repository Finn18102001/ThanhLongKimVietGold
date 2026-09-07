"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { getInvoiceByNo, listDocuments, listInvoices, listSalePayments, exportDocuments } from "./query";
import type {
  InvoiceDetail,
  InvoiceExportPage,
  InvoiceListFilter,
  InvoiceListPage,
  SalePaymentRecord,
} from "./types";
import type { StockReceiptDetail } from "./types-receipt";

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return Number(value);
  return 0;
}

function mapStockReceipt(raw: Record<string, unknown>): StockReceiptDetail {
  const items = (raw.items as Array<Record<string, unknown>> | null) ?? [];
  const payments = (raw.payments as Array<Record<string, unknown>> | null) ?? [];
  return {
    id: String(raw.id),
    receiptNo: String(raw.receiptNo ?? ""),
    status: String(raw.status ?? ""),
    documentStatus: (raw.documentStatus as StockReceiptDetail["documentStatus"]) ?? "COMPLETED",
    goodsStatus: (raw.goodsStatus as StockReceiptDetail["goodsStatus"]) ?? "RECEIVED",
    supplierId: raw.supplierId == null ? null : String(raw.supplierId),
    supplierName: String(raw.supplierName ?? ""),
    reason: String(raw.reason ?? ""),
    note: (raw.note as string | null) ?? null,
    totalDong: asNumber(raw.totalDong),
    paidDong: asNumber(raw.paidDong),
    remainingDong: asNumber(raw.remainingDong),
    paymentStatus: (raw.paymentStatus as StockReceiptDetail["paymentStatus"]) ?? "UNPAID",
    paymentMethod: String(raw.paymentMethod ?? "CASH"),
    expectedReceiveAt: (raw.expectedReceiveAt as string | null) ?? null,
    actorEmail: String(raw.actorEmail ?? ""),
    receivedAt: (raw.receivedAt as string | null) ?? null,
    completedAt: (raw.completedAt as string | null) ?? null,
    stockAppliedAt: (raw.stockAppliedAt as string | null) ?? null,
    createdAt: String(raw.createdAt ?? ""),
    items: items.map((row) => ({
      id: String(row.id),
      skuId: String(row.skuId),
      sku: String(row.sku ?? ""),
      name: String(row.name ?? ""),
      brandName: (row.brandName as string | null) ?? null,
      expectedQty: asNumber(row.expectedQty),
      receivedQty: asNumber(row.receivedQty),
      costPriceDong: asNumber(row.costPriceDong),
      costAmountDong: asNumber(row.costAmountDong),
      weightChi: row.weightChi == null ? null : Number(row.weightChi),
      unitCostDongPerChi: row.unitCostDongPerChi == null ? null : asNumber(row.unitCostDongPerChi),
      skuWeightChi: row.skuWeightChi == null ? null : Number(row.skuWeightChi),
    })),
    payments: payments.map((row) => ({
      id: String(row.id),
      amountDong: asNumber(row.amountDong),
      paymentMethod: String(row.paymentMethod ?? "CASH"),
      paidAt: String(row.paidAt ?? ""),
      actorEmail: String(row.actorEmail ?? ""),
      note: (row.note as string | null) ?? null,
    })),
  };
}

export async function fetchStockReceiptDetail(receiptId: string): Promise<StockReceiptDetail> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_purchase_receipt", {
    p_receipt_id: receiptId,
  });
  if (error) throw new Error(error.message);
  return mapStockReceipt((data ?? {}) as Record<string, unknown>);
}

export async function collectStockReceiptPayment(input: {
  receiptId: string;
  amountDong: number;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  note?: string;
  idempotencyKey?: string;
}): Promise<{ paidDong: number; remainingDong: number; paymentStatus: string }> {
  if (!Number.isInteger(input.amountDong) || input.amountDong <= 0) {
    throw new Error("Số tiền phải là số nguyên VND > 0");
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_collect_purchase_payment", {
    p_receipt_id: input.receiptId,
    p_amount_dong: input.amountDong,
    p_payment_method: input.paymentMethod,
    p_note: input.note || null,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/cashflow");
  revalidatePath("/suppliers");
  const payload = data as Record<string, unknown>;
  return {
    paidDong: asNumber(payload.paidDong),
    remainingDong: asNumber(payload.remainingDong),
    paymentStatus: String(payload.paymentStatus ?? ""),
  };
}

export async function receiveOrderedStockReceipt(input: {
  receiptId: string;
  idempotencyKey?: string;
}): Promise<{ goodsStatus: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_receive_ordered_purchase", {
    p_receipt_id: input.receiptId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  const payload = data as Record<string, unknown>;
  return { goodsStatus: String(payload.goodsStatus ?? "RECEIVED") };
}

export async function reverseStockReceipt(input: {
  receiptId: string;
  reason: string;
  idempotencyKey?: string;
}): Promise<{
  ok: boolean;
  receiptNo: string;
  documentStatus: string;
  goodsStatus: string;
}> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new Error("Phải nhập lý do đảo phiếu nhập (tối thiểu 3 ký tự).");
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_void_purchase_receipt", {
    p_receipt_id: input.receiptId,
    p_reason: reason,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/cashflow");
  revalidatePath("/suppliers");
  revalidatePath("/pos");
  const payload = data as Record<string, unknown>;
  return {
    ok: Boolean(payload.ok),
    receiptNo: String(payload.receiptNo ?? ""),
    documentStatus: String(payload.documentStatus ?? "CANCELLED"),
    goodsStatus: String(payload.goodsStatus ?? "CANCELLED"),
  };
}

export async function searchInvoices(filter: InvoiceListFilter): Promise<InvoiceListPage> {
  if (filter.transactionType || filter.fulfillment) {
    return listInvoices(filter);
  }
  return listDocuments(filter);
}

export async function exportInvoiceCsv(filter: InvoiceListFilter): Promise<InvoiceExportPage> {
  return exportDocuments(filter);
}

export async function fetchInvoiceDetail(invoiceNo: string): Promise<InvoiceDetail> {
  const invoice = await getInvoiceByNo(invoiceNo);
  if (!invoice) {
    throw new Error(`Không tìm thấy hóa đơn ${invoiceNo}.`);
  }
  return invoice;
}

export async function fetchSalePayments(saleId: string): Promise<SalePaymentRecord[]> {
  return listSalePayments(saleId);
}

export async function collectSalePayment(input: {
  saleId: string;
  amountDong: number;
  paymentMethod: "CASH" | "TRANSFER" | "CARD";
  note?: string;
  dueDate?: string | null;
  idempotencyKey?: string;
  receivedByStaffId?: string | null;
}): Promise<{
  paidDong: number;
  remainingDong: number;
  paymentStatus: string;
  dueDate: string | null;
}> {
  if (!Number.isInteger(input.amountDong) || input.amountDong <= 0) {
    throw new Error("Số tiền thu phải là số nguyên VND > 0");
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_collect_sale_payment", {
    p_sale_id: input.saleId,
    p_amount_dong: input.amountDong,
    p_payment_method: input.paymentMethod,
    p_note: input.note || null,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    p_due_date: input.dueDate || null,
    p_operator_staff_id: input.receivedByStaffId || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/customers");
  revalidatePath("/pos");
  const payload = data as {
    paid_dong: number;
    remaining_dong: number;
    payment_status: string;
    due_date: string | null;
  };
  return {
    paidDong: Number(payload.paid_dong),
    remainingDong: Number(payload.remaining_dong),
    paymentStatus: payload.payment_status,
    dueDate: payload.due_date,
  };
}

export async function fulfillInvoicePreorder(input: {
  saleId: string;
  operatorStaffId?: string | null;
}): Promise<{ fulfillmentStatus: string; remainingDong: number; paymentStatus: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_fulfill_preorder", {
    p_sale_id: input.saleId,
    p_idempotency_key: crypto.randomUUID(),
    p_operator_staff_id: input.operatorStaffId || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  const payload = data as {
    fulfillment_status: string;
    remaining_dong: number;
    payment_status: string;
  };
  return {
    fulfillmentStatus: payload.fulfillment_status,
    remainingDong: Number(payload.remaining_dong ?? 0),
    paymentStatus: payload.payment_status,
  };
}

export async function cancelInvoicePreorder(input: {
  saleId: string;
  reason?: string;
}): Promise<{ fulfillmentStatus: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_cancel_preorder", {
    p_sale_id: input.saleId,
    p_idempotency_key: crypto.randomUUID(),
    p_reason: input.reason || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/pos");
  const payload = data as { fulfillment_status: string };
  return { fulfillmentStatus: payload.fulfillment_status };
}

export async function voidInvoice(input: {
  invoiceId: string;
  reason: string;
}): Promise<{
  ok: boolean;
  invoiceNo: string;
  status: string;
}> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new Error("Phải nhập lý do hủy hóa đơn (tối thiểu 3 ký tự).");
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_void_invoice", {
    p_invoice_id: input.invoiceId,
    p_reason: reason,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/inventory");
  revalidatePath("/cashflow");
  revalidatePath("/pos");
  revalidatePath("/customers");
  const payload = data as {
    ok?: boolean;
    invoice_no?: string;
    status?: string;
  };
  return {
    ok: Boolean(payload.ok),
    invoiceNo: String(payload.invoice_no ?? ""),
    status: String(payload.status ?? "VOIDED"),
  };
}
