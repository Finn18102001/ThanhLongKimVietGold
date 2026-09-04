"use server";

import { getPosSession } from "@/shared/auth/session";
import { createServerSupabase } from "@/shared/supabase/server";
import {
  defaultCashflowRange,
  getCapitalSnapshot,
  getCashflowOverview,
  getCashLedger,
} from "./query";
import type { CashLedgerFilters } from "./types";

async function assertCashflowAdmin() {
  const session = await getPosSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Chỉ quản trị mới được thao tác dòng tiền.");
  }
}

export async function fetchCashflowOverview() {
  await assertCashflowAdmin();
  return getCashflowOverview();
}

export async function fetchCashLedger(filters: CashLedgerFilters) {
  await assertCashflowAdmin();
  return getCashLedger(filters);
}

export async function fetchCapitalSnapshot() {
  await assertCashflowAdmin();
  return getCapitalSnapshot();
}

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function depositCash(input: {
  accountId: string;
  amountDong: number;
  content: string;
}) {
  await assertCashflowAdmin();
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
  await assertCashflowAdmin();
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
  await assertCashflowAdmin();
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
