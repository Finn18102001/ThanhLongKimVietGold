"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import type {
  BuyDetail,
  BuyItemPayload,
  BuyListRow,
  CollectBuyPaymentResult,
  CompleteBuyResult,
  DebtSummary,
  MarketGoldRef,
  PaymentMethod,
} from "./types";

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return Number(value);
  return 0;
}

function mapBuyListRow(row: Record<string, unknown>): BuyListRow {
  return {
    id: String(row.id),
    buyNo: String(row.buyNo ?? ""),
    customerId: String(row.customerId ?? ""),
    customerName: String(row.customerName ?? ""),
    customerPhone: String(row.customerPhone ?? ""),
    totalDong: asNumber(row.totalDong),
    paidDong: asNumber(row.paidDong),
    remainingDong: asNumber(row.remainingDong),
    paymentStatus: String(row.paymentStatus ?? "UNPAID"),
    paymentMethod: String(row.paymentMethod ?? "CASH"),
    dueDate: (row.dueDate as string | null) ?? null,
    actorEmail: String(row.actorEmail ?? ""),
    completedAt: (row.completedAt as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  };
}

/**
 * Completes a customer BUY.
 * Catalog items: BE enforces ±300k vs reference_price_dong_per_chi (sell / chỉ).
 * Market gold (`is_market_gold`): UI sends reference 0; BE skips ±300k for market.
 * Only catalog exceptions need approvePriceException + reason.
 */
export async function completeBuy(input: {
  customerId: string;
  paymentMethod: PaymentMethod;
  items: BuyItemPayload[];
  note?: string | null;
  paidDong?: number | null;
  dueDate?: string | null;
  approvePriceException?: boolean;
  priceExceptionReason?: string | null;
  idempotencyKey?: string;
}): Promise<CompleteBuyResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_complete_buy", {
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    p_customer_id: input.customerId,
    p_payment_method: input.paymentMethod,
    p_items: input.items,
    p_note: input.note || null,
    p_paid_dong: input.paidDong ?? null,
    p_due_date: input.dueDate || null,
    p_approve_price_exception: input.approvePriceException ?? false,
    p_price_exception_reason: input.priceExceptionReason || null,
  });
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/purchase");
  revalidatePath("/inventory");
  revalidatePath("/customers");

  const raw = data as Record<string, unknown>;
  return {
    buyId: String(raw.buyId ?? ""),
    buyNo: String(raw.buyNo ?? ""),
    totalDong: asNumber(raw.totalDong),
    paidDong: asNumber(raw.paidDong),
    remainingDong: asNumber(raw.remainingDong),
    paymentStatus: String(raw.paymentStatus ?? ""),
    dueDate: (raw.dueDate as string | null) ?? null,
    customerId: String(raw.customerId ?? input.customerId),
  };
}

export async function collectBuyPayment(input: {
  buyId: string;
  amountDong: number;
  paymentMethod: PaymentMethod;
  note?: string | null;
  idempotencyKey?: string | null;
  dueDate?: string | null;
}): Promise<CollectBuyPaymentResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_collect_buy_payment", {
    p_buy_id: input.buyId,
    p_amount_dong: input.amountDong,
    p_payment_method: input.paymentMethod,
    p_note: input.note || null,
    p_idempotency_key: input.idempotencyKey || null,
    p_due_date: input.dueDate || null,
  });
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/purchase");
  revalidatePath("/customers");

  const raw = data as Record<string, unknown>;
  return {
    buyId: String(raw.buyId ?? input.buyId),
    buyNo: String(raw.buyNo ?? ""),
    paidDong: asNumber(raw.paidDong),
    remainingDong: asNumber(raw.remainingDong),
    paymentStatus: String(raw.paymentStatus ?? ""),
    dueDate: (raw.dueDate as string | null) ?? null,
  };
}

export async function listMarketGoldRefs(): Promise<MarketGoldRef[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_market_gold_refs");
  if (error) {
    throw new Error(error.message);
  }
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return rows.map((row) => ({
    id: String(row.id),
    brand: String(row.brand ?? ""),
    product: String(row.product ?? ""),
    purity: (row.purity as string | null) ?? null,
    buyDong: asNumber(row.buyDong),
    sellDong: asNumber(row.sellDong),
  }));
}

export async function listBuys(input?: {
  limit?: number;
  offset?: number;
  paymentStatus?: string | null;
  q?: string | null;
}): Promise<BuyListRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_buys", {
    p_limit: input?.limit ?? 50,
    p_offset: input?.offset ?? 0,
    p_payment_status: input?.paymentStatus ?? null,
    p_q: input?.q ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return rows.map(mapBuyListRow);
}

export async function getBuy(buyId: string): Promise<BuyDetail> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_buy", {
    p_buy_id: buyId,
  });
  if (error) {
    throw new Error(error.message);
  }
  const raw = data as Record<string, unknown>;
  const items = ((raw.items as Record<string, unknown>[] | null) ?? []).map((item) => ({
    id: String(item.id),
    skuId: item.skuId != null ? String(item.skuId) : null,
    productName: String(item.productName ?? ""),
    goldType: (item.goldType as string | null) ?? null,
    goldAge: (item.goldAge as string | null) ?? null,
    brandId: item.brandId != null ? String(item.brandId) : null,
    brandName: (item.brandName as string | null) ?? null,
    quantity: asNumber(item.quantity),
    weightChi: asNumber(item.weightChi),
    unitPriceDong: asNumber(item.unitPriceDong),
    totalPriceDong: asNumber(item.totalPriceDong),
    isMarketGold: Boolean(item.isMarketGold),
    priceException: Boolean(item.priceException),
  }));
  const payments = ((raw.payments as Record<string, unknown>[] | null) ?? []).map((p) => ({
    id: String(p.id),
    amountDong: asNumber(p.amountDong),
    paymentMethod: String(p.paymentMethod ?? "CASH"),
    paidAt: String(p.paidAt ?? ""),
    actorEmail: String(p.actorEmail ?? ""),
    note: (p.note as string | null) ?? null,
  }));

  return {
    id: String(raw.id),
    buyNo: String(raw.buyNo ?? ""),
    customerId: String(raw.customerId ?? ""),
    customerName: String(raw.customerName ?? ""),
    customerPhone: String(raw.customerPhone ?? ""),
    customerNo: (raw.customerNo as string | null) ?? null,
    customerCitizenId: (raw.customerCitizenId as string | null) ?? null,
    customerAddress: (raw.customerAddress as string | null) ?? null,
    customerBankAccount: (raw.customerBankAccount as string | null) ?? null,
    customerBankHolder: (raw.customerBankHolder as string | null) ?? null,
    totalDong: asNumber(raw.totalDong),
    paidDong: asNumber(raw.paidDong),
    remainingDong: asNumber(raw.remainingDong),
    paymentStatus: String(raw.paymentStatus ?? "UNPAID"),
    paymentMethod: String(raw.paymentMethod ?? "CASH"),
    dueDate: (raw.dueDate as string | null) ?? null,
    actorEmail: String(raw.actorEmail ?? ""),
    completedAt: (raw.completedAt as string | null) ?? null,
    note: (raw.note as string | null) ?? null,
    items,
    payments,
  };
}

export async function getCustomerDebtSummary(customerId: string): Promise<DebtSummary> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_customer_debt_summary", {
    p_customer_id: customerId,
  });
  if (error) {
    throw new Error(error.message);
  }
  const raw = data as Record<string, unknown>;
  return {
    receivableDong: asNumber(raw.receivableDong),
    payableDong: asNumber(raw.payableDong),
    buyCount: asNumber(raw.buyCount),
    saleCount: asNumber(raw.saleCount),
  };
}
