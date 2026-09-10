"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import type {
  BuyAttachment,
  BuyAttachmentDocKind,
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

function mapBuyAttachment(row: Record<string, unknown>): BuyAttachment {
  return {
    id: String(row.id),
    storagePath: String(row.storagePath ?? row.storage_path ?? ""),
    fileName: String(row.fileName ?? row.file_name ?? ""),
    mimeType: String(row.mimeType ?? row.mime_type ?? ""),
    byteSize:
      row.byteSize != null || row.byte_size != null
        ? asNumber(row.byteSize ?? row.byte_size)
        : null,
    docKind: String(row.docKind ?? row.doc_kind ?? "RELATED"),
    actorEmail: String(row.actorEmail ?? row.actor_email ?? ""),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
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
  bankAccount?: string | null;
  bankAccountHolder?: string | null;
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
    p_bank_account: input.bankAccount?.trim() || null,
    p_bank_account_holder: input.bankAccountHolder?.trim() || null,
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
 * Customer confirm: agree → INVOICE_ISSUED (no stock/cash yet);
 * disagree → CANCELLED + rollback temp data.
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
  revalidatePath("/invoices");
  return getBuy(input.buyId);
}

/** After invoice step: confirm → FORM02_READY (+ form02_no). Print not required. */
export async function confirmBuyInvoice(input: {
  buyId: string;
  idempotencyKey?: string;
}): Promise<BuyDetail> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_confirm_buy_invoice", {
    p_buy_id: input.buyId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchase");
  revalidatePath("/invoices");
  return getBuy(input.buyId);
}

/** Form 02 done → COMPLETED + stock + cash + payable. */
export async function completeBuyMelt(input: {
  buyId: string;
  idempotencyKey?: string;
}): Promise<BuyDetail> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_complete_buy_melt", {
    p_buy_id: input.buyId,
    p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchase");
  revalidatePath("/inventory");
  revalidatePath("/customers");
  revalidatePath("/invoices");
  return getBuy(input.buyId);
}

const BUY_PDF_BUCKET = "buy-attachments";

const ALLOWED_UPLOAD_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/octet-stream",
]);

/**
 * Upload PDF (kept as PDF) or image (prefer WebP from client optimize).
 * Inserts a new attachment row — never deletes prior files on failure/replace.
 */
export async function uploadBuyFile(
  formData: FormData,
): Promise<{ ok: true; buy: BuyDetail } | { ok: false; message: string }> {
  try {
    const buyId = String(formData.get("buyId") || "").trim();
    const docKindRaw = String(formData.get("docKind") || "RELATED").trim().toUpperCase();
    const docKind = docKindRaw as BuyAttachmentDocKind;
    const rawFile = formData.get("file");
    if (!buyId) return { ok: false, message: "Thiếu mã phiếu mua" };
    if (!["PURITY_TEST", "RELATED", "SIGNED_PDF"].includes(docKind)) {
      return { ok: false, message: "Loại tài liệu không hợp lệ" };
    }
    if (!rawFile || typeof rawFile === "string") {
      return { ok: false, message: "Không có file" };
    }
    const file = rawFile as File;
    const fileSize = typeof file.size === "number" ? file.size : 0;
    if (fileSize <= 0) return { ok: false, message: "File trống" };
    if (fileSize > 10 * 1024 * 1024) {
      return { ok: false, message: "File tối đa 10MB" };
    }

    let mime = String(file.type || "").toLowerCase();
    const name = (file.name || "file").replace(/[^\w.\-() ]+/g, "_");
    const ext = (/\.([^.]+)$/.exec(name)?.[1] || "").toLowerCase();
    if (!mime || mime === "application/octet-stream") {
      if (ext === "pdf") mime = "application/pdf";
      else if (ext === "webp") mime = "image/webp";
      else if (ext === "png") mime = "image/png";
      else if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
    }
    if (!ALLOWED_UPLOAD_MIME.has(mime)) {
      return { ok: false, message: "Chỉ chấp nhận PDF hoặc ảnh (JPEG/PNG/WebP)" };
    }
    if (mime === "application/pdf" && ext !== "pdf") {
      return { ok: false, message: "Tên file PDF phải kết thúc bằng .pdf" };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const stamp = Date.now();
    const storagePath = `${buyId}/${stamp}-${name}`;

    const supabase = await createServerSupabase();
    const { error: uploadError } = await supabase.storage
      .from(BUY_PDF_BUCKET)
      .upload(storagePath, bytes, {
        contentType: mime === "application/octet-stream" ? "application/pdf" : mime,
        upsert: false,
      });
    if (uploadError) return { ok: false, message: uploadError.message };

    const { error } = await supabase.rpc("pos_attach_buy_file", {
      p_buy_id: buyId,
      p_storage_path: storagePath,
      p_file_name: name,
      p_mime_type: mime === "application/octet-stream" ? "application/pdf" : mime,
      p_byte_size: bytes.byteLength,
      p_doc_kind: docKind,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) {
      // Leave orphaned storage object rather than deleting other attachments.
      return { ok: false, message: error.message };
    }

    revalidatePath("/purchase");
    revalidatePath("/invoices");
    return { ok: true, buy: await getBuy(buyId) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Không tải được file",
    };
  }
}

/** @deprecated Prefer uploadBuyFile with docKind=SIGNED_PDF */
export async function uploadBuyPdf(
  formData: FormData,
): Promise<{ ok: true; buy: BuyDetail } | { ok: false; message: string }> {
  if (!formData.get("docKind")) formData.set("docKind", "SIGNED_PDF");
  return uploadBuyFile(formData);
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
  const attachments = ((raw.attachments as Record<string, unknown>[] | null) ?? []).map(
    mapBuyAttachment,
  );
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
    intendedPaidDong:
      raw.intendedPaidDong != null || raw.intended_paid_dong != null
        ? asNumber(raw.intendedPaidDong ?? raw.intended_paid_dong)
        : null,
    items,
    payments,
    attachments,
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
