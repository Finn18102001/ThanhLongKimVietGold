"use server";

import {
  getReportingSnapshot as loadReportingSnapshot,
  getStaffSalesReport as loadStaffSalesReport,
  getTransactionExport as loadTransactionExport,
} from "./query";

export async function fetchReportingSnapshot(from: string, to: string) {
  return loadReportingSnapshot(from, to);
}

export async function fetchStaffSalesReport(from: string, to: string) {
  return loadStaffSalesReport(from, to);
}

export async function fetchTransactionExport(from: string, to: string) {
  return loadTransactionExport(from, to);
}
