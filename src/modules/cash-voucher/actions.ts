"use server";

import { assertAdminRead } from "@/shared/auth/assert";
import { getCashRequest } from "@/modules/fund-cash/query";
import type { CashRequestRow } from "@/modules/fund-cash/types";
import { listCashVouchers } from "./query";
import type { CashVoucherListFilter, CashVoucherListPage } from "./types";

export async function searchCashVouchers(
  filter: CashVoucherListFilter,
): Promise<CashVoucherListPage> {
  await assertAdminRead();
  return listCashVouchers(filter);
}

/** View + print: load full YC row (lines) via fund-cash contract. */
export async function getCashVoucherDetail(
  requestId: string,
): Promise<CashRequestRow> {
  await assertAdminRead();
  const id = requestId.trim();
  if (!id) throw new Error("Thiếu mã phiếu thu/chi.");
  return getCashRequest(id);
}
