"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import type {
  CccdDocumentType,
  CustomerActivityFilter,
  CustomerDetail,
  CustomerDirectoryStats,
  CustomerDocument,
  CustomerDocumentUploadResult,
  CustomerHistoryItem,
  CustomerInput,
  CustomerListPage,
  CustomerRecord,
  CustomerSaveResult,
  CustomerSort,
} from "./types";
import { mapCustomer, mapCustomerDetail, mapCustomerDirectoryStats, mapCustomerList, mapHistory } from "./map";

const CCCD_BUCKET = "customer-cccd";
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function revalidateCustomerViews() {
  revalidatePath("/customers");
  revalidatePath("/pos");
}

function customerArgs(input: CustomerInput) {
  return {
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email ?? null,
    p_address: input.address ?? null,
    p_tax_code: input.taxCode ?? null,
    p_note: input.note ?? null,
    p_gender: input.gender ?? null,
    p_customer_group: input.customerGroup ?? "RETAIL",
    p_date_of_birth: input.dateOfBirth || null,
    p_customer_type: input.customerType ?? "INDIVIDUAL",
    p_nationality: input.nationality ?? null,
    p_citizen_id: input.citizenId ?? null,
    p_citizen_id_issue_date: input.citizenIdIssueDate || null,
    p_citizen_id_issue_place: input.citizenIdIssuePlace ?? null,
    p_citizen_id_expiry_date: input.citizenIdExpiryDate || null,
    p_business_name: input.businessName ?? null,
    p_representative_name: input.representativeName ?? null,
  };
}

export async function searchCustomers(input: {
  query?: string;
  group?: string | null;
  activity?: CustomerActivityFilter;
  sort?: CustomerSort;
  limit?: number;
  offset?: number;
}): Promise<CustomerListPage> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_list_customers", {
    p_query: input.query ?? "",
    p_group: input.group || null,
    p_sort: input.sort ?? "newest",
    p_limit: input.limit ?? 20,
    p_offset: input.offset ?? 0,
    p_activity: input.activity || null,
  });
  if (error) throw new Error(error.message);
  return mapCustomerList(
    data as {
      items: Parameters<typeof mapCustomerList>[0]["items"];
      total: number;
      limit: number;
      offset: number;
    },
  );
}

export async function fetchCustomerDirectoryStats(): Promise<CustomerDirectoryStats> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_customer_directory_stats");
  if (error) throw new Error(error.message);
  return mapCustomerDirectoryStats(data as Parameters<typeof mapCustomerDirectoryStats>[0]);
}

export async function exportCustomers(input: {
  query?: string;
  group?: string | null;
  activity?: CustomerActivityFilter;
  sort?: CustomerSort;
}): Promise<CustomerListPage> {
  const first = await searchCustomers({ ...input, limit: 1, offset: 0 });
  const total = Math.min(first.total, 5000);
  if (total === 0) {
    return { items: [], total: 0, limit: 0, offset: 0 };
  }
  return searchCustomers({ ...input, limit: total, offset: 0 });
}

export async function fetchCustomer(id: string): Promise<CustomerDetail> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_get_customer", { p_id: id });
  if (error) throw new Error(error.message);
  const detail = mapCustomerDetail(
    data as {
      customer: Parameters<typeof mapCustomerDetail>[0]["customer"];
      history: Parameters<typeof mapCustomerDetail>[0]["history"];
    },
  );

  const withUrls = await Promise.all(
    detail.customer.documents.map(async (doc) => ({
      ...doc,
      signedUrl: await createCccdSignedUrl(doc.storagePath),
    })),
  );

  return {
    ...detail,
    customer: { ...detail.customer, documents: withUrls },
  };
}

/** Full buy+sale activity for one customer (Excel export / complete timeline). */
export async function listCustomerActivity(
  customerId: string,
): Promise<CustomerHistoryItem[]> {
  const supabase = await createServerSupabase();
  const id = String(customerId || "").trim();
  if (!id) throw new Error("Thiếu mã khách hàng");

  const [salesRes, buysRes] = await Promise.all([
    supabase
      .from("pos_invoices")
      .select(
        "id, invoice_no, issued_at, total_dong, pos_sales!inner(sale_no, paid_dong, remaining_dong, payment_status, status, payment_method, transaction_type, fulfillment_status, customer_id)",
      )
      .eq("customer_id", id)
      .eq("pos_sales.status", "COMPLETED")
      .order("issued_at", { ascending: false })
      .limit(5000),
    supabase
      .from("pos_buys")
      .select(
        "id, buy_no, completed_at, created_at, total_dong, paid_dong, remaining_dong, payment_status, status, payment_method",
      )
      .eq("customer_id", id)
      .eq("status", "COMPLETED")
      .order("completed_at", { ascending: false })
      .limit(5000),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (buysRes.error) throw new Error(buysRes.error.message);

  type SaleEmbed = {
    sale_no: string;
    paid_dong: number | null;
    remaining_dong: number | null;
    payment_status: string | null;
    status: string;
    payment_method: string | null;
    transaction_type: string | null;
    fulfillment_status: string | null;
  };

  const sales = (salesRes.data ?? []).map((row) => {
    const sale = Array.isArray(row.pos_sales) ? row.pos_sales[0] : row.pos_sales;
    const s = sale as SaleEmbed | null;
    return mapHistory({
      activity_id: String(row.id),
      activity_kind: "SALE",
      doc_no: row.invoice_no,
      invoice_id: row.id,
      invoice_no: row.invoice_no,
      sale_no: s?.sale_no ?? row.invoice_no,
      issued_at: row.issued_at,
      total_dong: Number(row.total_dong ?? 0),
      paid_dong: Number(s?.paid_dong ?? 0),
      remaining_dong: Number(s?.remaining_dong ?? 0),
      payment_status: s?.payment_status ?? undefined,
      status: s?.status ?? "COMPLETED",
      payment_method: s?.payment_method ?? "",
      transaction_type: s?.transaction_type ?? "SALE",
      fulfillment_status: s?.fulfillment_status ?? "DELIVERED",
    });
  });

  const buys = (buysRes.data ?? []).map((row) =>
    mapHistory({
      activity_id: String(row.id),
      activity_kind: "BUY",
      doc_no: row.buy_no,
      invoice_id: null,
      invoice_no: row.buy_no,
      sale_no: row.buy_no,
      issued_at: row.completed_at ?? row.created_at,
      total_dong: Number(row.total_dong ?? 0),
      paid_dong: Number(row.paid_dong ?? 0),
      remaining_dong: Number(row.remaining_dong ?? 0),
      payment_status: row.payment_status ?? undefined,
      status: row.status,
      payment_method: row.payment_method ?? "",
      transaction_type: "BUY",
      fulfillment_status: "RECEIVED",
    }),
  );

  return [...sales, ...buys].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );
}

export async function createCustomer(input: CustomerInput): Promise<CustomerSaveResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_create_customer", customerArgs(input));
  if (error) return { ok: false, message: error.message };
  const payload = data as { customer?: Parameters<typeof mapCustomer>[0] } | null;
  if (!payload?.customer) return { ok: false, message: "Phản hồi tạo khách không hợp lệ" };
  revalidateCustomerViews();
  return { ok: true, customer: mapCustomer(payload.customer) };
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
): Promise<CustomerSaveResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_update_customer", {
    p_id: id,
    ...customerArgs(input),
  });
  if (error) return { ok: false, message: error.message };
  const payload = data as { customer?: Parameters<typeof mapCustomer>[0] } | null;
  if (!payload?.customer) return { ok: false, message: "Phản hồi cập nhật khách không hợp lệ" };
  revalidateCustomerViews();
  return { ok: true, customer: mapCustomer(payload.customer) };
}

export async function deleteCustomer(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("pos_delete_customer", { p_id: id });
  if (error) throw new Error(error.message);
  revalidateCustomerViews();
}

async function createCccdSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.storage
    .from(CCCD_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

export async function uploadCustomerCccd(
  formData: FormData,
): Promise<CustomerDocumentUploadResult> {
  try {
    const customerId = String(formData.get("customerId") || "").trim();
    const documentType = String(formData.get("documentType") || "").trim() as CccdDocumentType;
    const rawFile = formData.get("file");

    if (!customerId) return { ok: false, message: "Thiếu mã khách hàng" };
    if (documentType !== "CCCD_FRONT" && documentType !== "CCCD_BACK") {
      return { ok: false, message: "Loại ảnh CCCD không hợp lệ" };
    }
    if (!rawFile || typeof rawFile === "string") {
      return { ok: false, message: "Không có file ảnh" };
    }

    const file = rawFile as File;
    const fileSize = typeof file.size === "number" ? file.size : 0;
    if (fileSize <= 0) return { ok: false, message: "File ảnh trống" };
    if (fileSize > 10 * 1024 * 1024) {
      return { ok: false, message: "Ảnh CCCD tối đa 10MB trước khi xử lý" };
    }

    const inputMime = String(file.type || "").toLowerCase();
    if (
      inputMime &&
      !ALLOWED_MIME.has(inputMime) &&
      inputMime !== "image/jpg" &&
      inputMime !== "application/octet-stream"
    ) {
      return { ok: false, message: "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP" };
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    // Same Product/News server safety net: sharp re-encode to WebP ≤1200px / ~350KB.
    const sharp = (await import("sharp")).default;
    let output = await sharp(inputBuffer, { failOn: "none" })
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    if (output.byteLength > 350 * 1024) {
      output = await sharp(inputBuffer, { failOn: "none" })
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 70 })
        .toBuffer();
    }

    if (output.byteLength > 5 * 1024 * 1024) {
      return { ok: false, message: "Ảnh CCCD sau tối ưu vẫn vượt 5MB" };
    }

    const contentType = "image/webp";
    const storagePath = `${customerId}/${documentType.toLowerCase()}.webp`;

    const supabase = await createServerSupabase();
    const { error: uploadError } = await supabase.storage
      .from(CCCD_BUCKET)
      .upload(storagePath, output, {
        contentType,
        upsert: true,
      });
    if (uploadError) return { ok: false, message: uploadError.message };

    const { data, error } = await supabase.rpc("pos_upsert_customer_document", {
      p_customer_id: customerId,
      p_document_type: documentType,
      p_storage_path: storagePath,
      p_mime_type: contentType,
      p_byte_size: output.byteLength,
    });
    if (error) return { ok: false, message: error.message };

    const doc = (
      data as {
        document: {
          id: string;
          document_type: CccdDocumentType;
          storage_path: string;
          uploaded_by: string;
          uploaded_at: string;
        };
      }
    ).document;

    revalidateCustomerViews();
    return {
      ok: true,
      document: {
        id: doc.id,
        documentType: doc.document_type,
        storagePath: doc.storage_path,
        mimeType: contentType,
        byteSize: output.byteLength,
        uploadedBy: doc.uploaded_by,
        uploadedAt: doc.uploaded_at,
        signedUrl: await createCccdSignedUrl(storagePath),
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Không tải được ảnh căn cước",
    };
  }
}

export async function auditViewCccd(customerId: string, documentType: CccdDocumentType): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.rpc("pos_audit_view_cccd", {
    p_customer_id: customerId,
    p_document_type: documentType,
  });
}
