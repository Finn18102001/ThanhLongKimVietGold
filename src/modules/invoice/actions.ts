"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { getInvoiceByNo, listDocuments, listInvoices, listSalePayments, exportDocuments } from "./query";
import type {
  InvoiceDetail,
  InvoiceListFilter,
  InvoiceListPage,
  SalePaymentRecord,
} from "./types";

export async function searchInvoices(filter: InvoiceListFilter): Promise<InvoiceListPage> {
  if (filter.transactionType || filter.fulfillment) {
    return listInvoices(filter);
  }
  return listDocuments(filter);
}

export async function exportInvoiceCsv(filter: InvoiceListFilter): Promise<InvoiceListPage> {
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
