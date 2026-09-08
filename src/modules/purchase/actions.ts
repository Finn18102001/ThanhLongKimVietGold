"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import type {
  BuyDetail,
  BuyDetailItem,
  BuyItemPayload,
  BuyListRow,
  BuyPaymentRow,
  BuyStatus,
  BuyWorkflowStatus,
  CollectBuyPaymentResult,
  CompleteBuyResult,
  DebtSummary,
  MarketGoldRef,
  MeltWeightItemPayload,
  PaymentMethod,
} from "./types";

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return Number(value);
  return 0;
}

function asWorkflowStatus(value: unknown, fallback: BuyWorkflowStatus): BuyWorkflowStatus | string {
  if (typeof value === "string" && value) return value;
  return fallback;
}

function asBuyStatus(value: unknown, fallback: BuyStatus): BuyStatus | string {
  if (typeof value === "string" && value) return value;
  return fallback;
}

function mapWorkflowFields(row: Record<string, unknown>, completedAt: string | null) {
  const status = asBuyStatus(
    row.status ?? row.buyStatus,
    completedAt ? "COMPLETED" : "PROCESSING",
  );
  const workflowFallback: BuyWorkflowStatus =
    status === "COMPLETED"
      ? "COMPLETED"
      : status === "CANCELLED" || status === "VOIDED"
        ? "CANCELLED"
        : "INTAKE";
  return {
    status,
    workflowStatus: asWorkflowStatus(
      row.workflowStatus ?? row.workflow_status,
      workflowFallback,
    ),
    meltCommitmentNo:
      (row.meltCommitmentNo as string | null) ??
      (row.melt_commitment_no as string | null) ??
      null,
    form02No: (row.form02No as string | null) ?? (row.form02_no as string | null) ?? null,
    meltingStartedAt:
      (row.meltingStartedAt as string | null) ??
      (row.melting_started_at as string | null) ??
      null,
    attachmentPdfPath:
      (row.attachmentPdfPath as string | null) ??
      (row.attachment_pdf_path as string | null) ??
      null,
  };
}

function mapBuyListRow(row: Record<string, unknown>): BuyListRow {
  const completedAt = (row.completedAt as string | null) ?? null;
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
    completedAt,
    note: (row.note as string | null) ?? null,
    ...mapWorkflowFields(row, completedAt),
  };
}

function mapBuyDetailItem(item: Record<string, unknown>): BuyDetailItem {
  const weightChi = asNumber(item.weightChi ?? item.weight_chi);
  const weightBefore =
    item.weightBeforeChi != null || item.weight_before_chi != null
      ? asNumber(item.weightBeforeChi ?? item.weight_before_chi)
      : weightChi;
  const afterRaw = item.weightAfterChi ?? item.weight_after_chi;
  return {
    id: String(item.id),
    skuId: item.skuId != null ? String(item.skuId) : item.sku_id != null ? String(item.sku_id) : null,
    productName: String(item.productName ?? item.product_name ?? ""),
    goldType: (item.goldType as string | null) ?? (item.gold_type as string | null) ?? null,
    goldAge: (item.goldAge as string | null) ?? (item.gold_age as string | null) ?? null,
    brandId:
      item.brandId != null
        ? String(item.brandId)
        : item.brand_id != null
          ? String(item.brand_id)
          : null,
    brandName: (item.brandName as string | null) ?? (item.brand_name as string | null) ?? null,
    quantity: asNumber(item.quantity),
    weightChi,
    weightBeforeChi: weightBefore,
    weightAfterChi: afterRaw == null || afterRaw === "" ? null : asNumber(afterRaw),
    unitPriceDong: asNumber(item.unitPriceDong ?? item.unit_price_dong),
    totalPriceDong: asNumber(item.totalPriceDong ?? item.total_price_dong),
    isMarketGold: Boolean(item.isMarketGold ?? item.is_market_gold),
    priceException: Boolean(item.priceException ?? item.price_exception),
  };
}

/**
 * Creates a PROCESSING buy intake (melt workflow entry).
 * Same args as former pos_complete_buy; does not complete stock-in.
 * Catalog items: BE enforces ±300k vs reference_price_dong_per_chi (sell / chỉ).
 * Market gold (`is_market_gold`): UI sends reference 0; BE skips ±300k for market.
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
  const { data, error } = await supabase.rpc("pos_create_buy_intake", {
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
    buyId: String(raw.buyId ?? raw.buy_id ?? ""),
    buyNo: String(raw.buyNo ?? raw.buy_no ?? ""),
    totalDong: asNumber(raw.totalDong ?? raw.total_dong),
    paidDong: asNumber(raw.paidDong ?? raw.paid_dong),
    remainingDong: asNumber(raw.remainingDong ?? raw.remaining_dong),
    paymentStatus: String(raw.paymentStatus ?? raw.payment_status ?? "UNPAID"),
    dueDate: (raw.dueDate as string | null) ?? (raw.due_date as string | null) ?? null,
    customerId: String(raw.customerId ?? raw.customer_id ?? input.customerId),
  };
}

export async function issueMeltCommitment(input: {
  buyId: string;
  idempotencyKey?: string;
}): Promise<BuyDetail> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_issue_melt_commitment", {
    p_buy_id: input.buyId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchase");
  return getBuy(input.buyId);
}

export async function startBuyMelting(input: {
  buyId: string;
  idempotencyKey?: string;
}): Promise<BuyDetail> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_start_buy_melting", {
    p_buy_id: input.buyId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchase");
  return getBuy(input.buyId);
}

export async function setBuyMeltWeights(input: {
  buyId: string;
  items: MeltWeightItemPayload[];
  idempotencyKey?: string;
}): Promise<BuyDetail> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_set_buy_melt_weights", {
    p_buy_id: input.buyId,
    p_items: input.items,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchase");
  return getBuy(input.buyId);
}

/**
 * Confirm melt result. p_agree=true completes buy (Form 02 + invoice path on BE).
 * Optional payment fields forwarded when present for settlement at confirm.
 */
export async function confirmBuyMelt(input: {
  buyId: string;
  agree: boolean;
  idempotencyKey?: string;
  paymentMethod?: PaymentMethod | null;
  paidDong?: number | null;
  dueDate?: string | null;
}): Promise<BuyDetail> {
  const supabase = await createServerSupabase();
  const payload: Record<string, unknown> = {
    p_buy_id: input.buyId,
    p_agree: input.agree,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  };
  if (input.paymentMethod != null) payload.p_payment_method = input.paymentMethod;
  // Only forward paid when explicitly set; never send 0 from PROCESSING rows
  // (BE coalesce would treat 0 as intentional unpaid).
  if (input.paidDong != null && input.paidDong > 0) payload.p_paid_dong = input.paidDong;
  if (input.dueDate != null) payload.p_due_date = input.dueDate;

  const { error } = await supabase.rpc("pos_confirm_buy_melt", payload);
  if (error) throw new Error(error.message);
  revalidatePath("/purchase");
  revalidatePath("/inventory");
  revalidatePath("/customers");
  revalidatePath("/invoices");
  return getBuy(input.buyId);
}

const BUY_PDF_BUCKET = "buy-attachments";

export async function uploadBuyPdf(
  formData: FormData,
): Promise<{ ok: true; buy: BuyDetail } | { ok: false; message: string }> {
  try {
    const buyId = String(formData.get("buyId") || "").trim();
    const rawFile = formData.get("file");
    if (!buyId) return { ok: false, message: "Thiếu mã phiếu mua" };
    if (!rawFile || typeof rawFile === "string") {
      return { ok: false, message: "Không có file PDF" };
    }
    const file = rawFile as File;
    const fileSize = typeof file.size === "number" ? file.size : 0;
    if (fileSize <= 0) return { ok: false, message: "File PDF trống" };
    if (fileSize > 10 * 1024 * 1024) {
      return { ok: false, message: "PDF tối đa 10MB" };
    }
    const mime = String(file.type || "").toLowerCase();
    if (mime && mime !== "application/pdf" && mime !== "application/octet-stream") {
      return { ok: false, message: "Chỉ chấp nhận file PDF" };
    }
    const name = (file.name || "buy.pdf").replace(/[^\w.\-() ]+/g, "_");
    if (!name.toLowerCase().endsWith(".pdf")) {
      return { ok: false, message: "Tên file phải kết thúc bằng .pdf" };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const stamp = Date.now();
    const storagePath = `${buyId}/${stamp}-${name}`;

    const supabase = await createServerSupabase();
    const { error: uploadError } = await supabase.storage
      .from(BUY_PDF_BUCKET)
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) return { ok: false, message: uploadError.message };

    const { error } = await supabase.rpc("pos_attach_buy_pdf", {
      p_buy_id: buyId,
      p_storage_path: storagePath,
      p_file_name: name,
      p_byte_size: bytes.byteLength,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) return { ok: false, message: error.message };

    revalidatePath("/purchase");
    revalidatePath("/invoices");
    return { ok: true, buy: await getBuy(buyId) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Không tải được PDF",
    };
  }
}

export async function getBuyPdfSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.storage
    .from(BUY_PDF_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Void a COMPLETED customer buy: compensating stock OUT + cash IN reclaim.
 * Actor allow-list enforced by BE (same as invoice void).
 */
export async function voidBuy(input: {
  buyId: string;
  reason: string;
  idempotencyKey?: string;
}): Promise<BuyDetail> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_void_buy", {
    p_buy_id: input.buyId,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchase");
  revalidatePath("/inventory");
  revalidatePath("/customers");
  revalidatePath("/invoices");
  return getBuy(input.buyId);
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
  const items = ((raw.items as Record<string, unknown>[] | null) ?? []).map(mapBuyDetailItem);
  const payments: BuyPaymentRow[] = ((raw.payments as Record<string, unknown>[] | null) ?? []).map(
    (p) => ({
      id: String(p.id),
      amountDong: asNumber(p.amountDong),
      paymentMethod: String(p.paymentMethod ?? "CASH"),
      paidAt: String(p.paidAt ?? ""),
      actorEmail: String(p.actorEmail ?? ""),
      note: (p.note as string | null) ?? null,
    }),
  );

  const completedAt = (raw.completedAt as string | null) ?? null;
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
    completedAt,
    note: (raw.note as string | null) ?? null,
    ...mapWorkflowFields(raw, completedAt),
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
