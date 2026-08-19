"use server";

import { getReportingSnapshot as loadReportingSnapshot } from "./query";

export async function fetchReportingSnapshot(from: string, to: string) {
  return loadReportingSnapshot(from, to);
}
