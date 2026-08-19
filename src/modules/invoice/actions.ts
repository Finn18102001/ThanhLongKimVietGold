"use server";

import { getInvoiceByNo, listInvoices } from "./query";
import type { InvoiceDetail, InvoiceListFilter, InvoiceListPage } from "./types";

export async function searchInvoices(filter: InvoiceListFilter): Promise<InvoiceListPage> {
  return listInvoices(filter);
}

export async function fetchInvoiceDetail(invoiceNo: string): Promise<InvoiceDetail> {
  const invoice = await getInvoiceByNo(invoiceNo);
  if (!invoice) {
    throw new Error(`Không tìm thấy hóa đơn ${invoiceNo}.`);
  }
  return invoice;
}
