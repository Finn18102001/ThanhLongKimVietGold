"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/shared/supabase/server";
import { mapCustomer, mapCustomerDetail, mapCustomerDirectoryStats, mapCustomerList } from "./map";
import type {
  CccdDocumentType,
  CustomerActivityFilter,
  CustomerDetail,
  CustomerDirectoryStats,
  CustomerDocument,
  CustomerInput,
  CustomerListPage,
  CustomerRecord,
  CustomerSort,
} from "./types";

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

export async function createCustomer(input: CustomerInput): Promise<CustomerRecord> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_create_customer", customerArgs(input));
  if (error) throw new Error(error.message);
  revalidateCustomerViews();
  const payload = data as { customer?: Parameters<typeof mapCustomer>[0] };
  if (!payload.customer) throw new Error("Phản hồi tạo khách không hợp lệ");
  return mapCustomer(payload.customer);
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
): Promise<CustomerRecord> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pos_update_customer", {
    p_id: id,
    ...customerArgs(input),
  });
  if (error) throw new Error(error.message);
  revalidateCustomerViews();
  const payload = data as { customer?: Parameters<typeof mapCustomer>[0] };
  if (!payload.customer) throw new Error("Phản hồi cập nhật khách không hợp lệ");
  return mapCustomer(payload.customer);
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

export async function uploadCustomerCccd(input: {
  customerId: string;
  documentType: CccdDocumentType;
  fileName: string;
  contentType: string;
  base64: string;
}): Promise<CustomerDocument> {
  if (!ALLOWED_MIME.has(input.contentType)) {
    throw new Error("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP");
  }

  const binary = Buffer.from(input.base64, "base64");
  if (binary.byteLength === 0) throw new Error("File ảnh trống");
  if (binary.byteLength > 5 * 1024 * 1024) throw new Error("Ảnh CCCD tối đa 5MB");

  const ext =
    input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";
  const storagePath = `${input.customerId}/${input.documentType.toLowerCase()}.${ext}`;

  const supabase = await createServerSupabase();
  const { error: uploadError } = await supabase.storage
    .from(CCCD_BUCKET)
    .upload(storagePath, binary, {
      contentType: input.contentType,
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase.rpc("pos_upsert_customer_document", {
    p_customer_id: input.customerId,
    p_document_type: input.documentType,
    p_storage_path: storagePath,
    p_mime_type: input.contentType,
    p_byte_size: binary.byteLength,
  });
  if (error) throw new Error(error.message);

  const doc = (data as { document: {
    id: string;
    document_type: CccdDocumentType;
    storage_path: string;
    uploaded_by: string;
    uploaded_at: string;
  } }).document;

  revalidateCustomerViews();
  return {
    id: doc.id,
    documentType: doc.document_type,
    storagePath: doc.storage_path,
    mimeType: input.contentType,
    byteSize: binary.byteLength,
    uploadedBy: doc.uploaded_by,
    uploadedAt: doc.uploaded_at,
    signedUrl: await createCccdSignedUrl(storagePath),
  };
}

export async function auditViewCccd(customerId: string, documentType: CccdDocumentType): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.rpc("pos_audit_view_cccd", {
    p_customer_id: customerId,
    p_document_type: documentType,
  });
}
