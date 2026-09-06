"use server";

import { getPosSession } from "@/shared/auth/session";
import { assertAdminRead, assertAdminWrite } from "@/shared/auth/assert";
import { canAdminRead } from "@/shared/auth/permissions";
import { createServerSupabase } from "@/shared/supabase/server";
import {
  defaultCashflowRange,
  getCapitalSnapshot,
  getCashflowOverview,
  getCashLedger,
} from "./query";
import type { CashLedgerFilters } from "./types";

async function assertCashflowRead() {
  const session = await getPosSession();
  if (!session || !canAdminRead(session.role)) {
    throw new Error("Không có quyền xem dòng tiền.");
  }
  return session;
}

export async function fetchCashflowOverview() {
  await assertCashflowRead();
  return getCashflowOverview();
}

export async function fetchCashLedger(filters: CashLedgerFilters) {
  await assertCashflowRead();
  return getCashLedger(filters);
}

export async function fetchCapitalSnapshot() {
  await assertCashflowRead();
  return getCapitalSnapshot();
}

export async function exportCashLedger(filters: Omit<CashLedgerFilters, "limit" | "offset">) {
  await assertAdminRead();
  return getCashLedger({
    ...filters,
    limit: 5000,
    offset: 0,
  });
}

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function depositCash(input: {
  accountId: string;
  amountDong: number;
  content: string;
}) {
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_cashflow_deposit", {
    p_idempotency_key: newIdempotencyKey("dep"),
    p_account_id: input.accountId,
    p_amount_dong: Math.trunc(input.amountDong),
    p_content: input.content,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function withdrawCash(input: {
  accountId: string;
  amountDong: number;
  content: string;
}) {
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_cashflow_withdraw", {
    p_idempotency_key: newIdempotencyKey("wd"),
    p_account_id: input.accountId,
    p_amount_dong: Math.trunc(input.amountDong),
    p_content: input.content,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function transferCash(input: {
  fromAccountId: string;
  toAccountId: string;
  amountDong: number;
  content: string;
}) {
  await assertAdminWrite();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_cashflow_transfer", {
    p_idempotency_key: newIdempotencyKey("tf"),
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
    p_amount_dong: Math.trunc(input.amountDong),
    p_content: input.content,
  });
  if (error) throw new Error(error.message);
  return data;
}

export { defaultCashflowRange };
