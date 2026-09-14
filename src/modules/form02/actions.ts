"use server";

import { assertAdminRead } from "@/shared/auth/assert";
import { getBuy } from "@/modules/purchase/actions";
import type { BuyDetail } from "@/modules/purchase/types";
import { exportForm02, listForm02 } from "./query";
import type { Form02ListFilter, Form02ListPage } from "./types";

export async function searchForm02(filter: Form02ListFilter): Promise<Form02ListPage> {
  await assertAdminRead();
  return listForm02(filter);
}

export async function exportForm02Rows(
  filter: Omit<Form02ListFilter, "limit" | "offset">,
): Promise<Form02ListPage> {
  await assertAdminRead();
  return exportForm02(filter);
}

/** ADMIN / ADMIN_VIEWER: load buy for Form02 detail + print (view-only). */
export async function getForm02Detail(buyId: string): Promise<BuyDetail> {
  await assertAdminRead();
  const id = buyId.trim();
  if (!id) throw new Error("Thiếu mã phiếu mua.");
  const buy = await getBuy(id);
  if (!buy.form02No) {
    throw new Error("Phiếu mua này chưa có số Phiếu 02.");
  }
  return buy;
}
