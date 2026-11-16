"use server";

import { revalidatePath } from "next/cache";
import { assertAdminRead, assertAdminWrite } from "@/shared/auth/assert";
import {
  actionFail,
  actionFailFromSupabase,
  actionOk,
  formatActionError,
  runAction,
  type ActionResult,
} from "@/shared/lib/action-result";
import { createServerSupabase } from "@/shared/supabase/server";
import { getProductAdminRow, listProductAdminPage } from "./query";
import type { ProductAdminListFilter, ProductAdminPagePayload, ProductAdminRow, ProductFormInput } from "./types";

const PRODUCT_HISTORY_ENABLED = false;

function revalidateProductViews() {
  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/inventory/order");
  revalidatePath("/inventory/receive");
  revalidatePath("/inventory/adjust");
  revalidatePath("/inventory/history");
  revalidatePath("/label-print");
  revalidatePath("/pos");
  revalidatePath("/categories");
}

function slugifySimple(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePriceNumeric(priceText: string): number | null {
  const digits = String(priceText || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function parseNullableNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeWeight(weightChi: number | null): number | null {
  if (weightChi == null) return null;
  if (!Number.isFinite(weightChi) || weightChi <= 0) return null;
  return Math.round(weightChi * 100000) / 100000;
}

function normalizeGoldAge(goldAge: number | null): number | null {
  if (goldAge == null) return null;
  if (!Number.isFinite(goldAge) || goldAge <= 0 || goldAge > 1000) return null;
  return Math.round(goldAge * 1000) / 1000;
}

async function resolveSortOrder(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  productId?: string | null,
): Promise<number> {
  if (productId) {
    const kept = await supabase.from("products").select("sort_order").eq("id", productId).maybeSingle();
    if (kept.error) throw new Error(kept.error.message);
    if (kept.data?.sort_order != null) return Number(kept.data.sort_order);
  }
  const rows = await supabase.from("products").select("sort_order");
  if (rows.error) throw new Error(rows.error.message);
  let max = 0;
  for (const row of rows.data ?? []) {
    const n = Number(row.sort_order ?? 0);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

async function resolveSlug(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  name: string,
  productId?: string | null,
  existingSlug?: string | null,
): Promise<string> {
  if (productId && existingSlug) return String(existingSlug).trim();
  const base = slugifySimple(name) || productId || "san-pham";
  let candidate = base;
  for (let i = 0; i < 30; i += 1) {
    const result = await supabase.from("products").select("id").eq("slug", candidate).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data || result.data.id === productId) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return base;
}

async function resolveCategoryText(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  categoryId: string | null,
  fallback = "",
): Promise<string> {
  if (!categoryId) return fallback;
  const result = await supabase.from("categories").select("name").eq("id", categoryId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return String(result.data?.name ?? fallback ?? "");
}

async function ensureBrandExists(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  brandId: string,
): Promise<void> {
  const result = await supabase.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data?.id) throw new Error("Thương hiệu không tồn tại.");
}

async function ensureClassificationAllowed(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  input: ProductFormInput,
  before?: {
    brand_id: string | null;
    category_id: string | null;
    product_type_id: string | null;
  } | null,
): Promise<void> {
  await ensureBrandExists(supabase, input.brandId);

  const categoryChanged =
    !before || String(before.brand_id ?? "") !== input.brandId || String(before.category_id ?? "") !== String(input.categoryId ?? "");
  if (input.categoryId && categoryChanged) {
    const link = await supabase
      .from("brand_categories")
      .select("brand_id")
      .eq("brand_id", input.brandId)
      .eq("category_id", input.categoryId)
      .maybeSingle();
    if (link.error) throw new Error(link.error.message);
    if (!link.data?.brand_id) {
      throw new Error(
        "Danh mục chưa được liên kết với thương hiệu đã chọn. Hãy chọn lại danh mục trong danh sách của thương hiệu đó (hoặc vào tab Danh mục để gắn liên kết).",
      );
    }
  }

  const typeChanged =
    !before || String(before.product_type_id ?? "") !== String(input.productTypeId ?? "");
  if (input.productTypeId && typeChanged) {
    const type = await supabase
      .from("product_types")
      .select("id, is_active")
      .eq("id", input.productTypeId)
      .maybeSingle();
    if (type.error) throw new Error(type.error.message);
    if (!type.data?.id || type.data.is_active === false) {
      throw new Error("Loại sản phẩm không tồn tại hoặc đã ngừng dùng.");
    }
  }
}

function validateProductInput(input: ProductFormInput, mode: "create" | "update"): void {
  if (!input.name.trim()) throw new Error("Tên sản phẩm là bắt buộc.");
  if (!input.brandId.trim()) throw new Error("Thương hiệu là bắt buộc.");
  const weight = normalizeWeight(input.weightChi);
  if (mode === "create" && weight == null) {
    throw new Error("Định lượng (chỉ) là bắt buộc khi tạo sản phẩm.");
  }
  if (input.weightChi != null && weight == null) {
    throw new Error("Định lượng (chỉ) không hợp lệ.");
  }
  const goldAge = parseNullableNumber(input.goldAge);
  if (input.goldAge != null && input.goldAge !== 0 && goldAge == null) {
    throw new Error("Tuổi vàng không hợp lệ.");
  }
  if (goldAge != null && !(goldAge > 0 && goldAge <= 1000)) {
    throw new Error("Tuổi vàng phải lớn hơn 0 và không quá 1000.");
  }
  if (input.priceRowId && !input.priceText.trim()) {
    throw new Error("Đã chọn dòng bảng giá nhưng chưa có giá / ghi chú liên kết.");
  }
}

async function resolvePriceLink(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  priceRowId: string | null,
  priceText: string,
): Promise<{ priceText: string; priceNumeric: number | null; priceSourceProduct: string | null }> {
  if (!priceRowId) {
    return {
      priceText: priceText.trim(),
      priceNumeric: parsePriceNumeric(priceText),
      priceSourceProduct: null,
    };
  }
  const row = await supabase
    .from("gold_price_rows")
    .select("id, product, sell")
    .eq("id", priceRowId)
    .maybeSingle();
  if (row.error) throw new Error(row.error.message);
  if (!row.data?.id) throw new Error("Dòng bảng giá không tồn tại.");
  const sell = Number(row.data.sell);
  const sellDong = Number.isFinite(sell) && sell > 0 ? Math.round(sell) : null;
  const linkedText = priceText.trim() || (sellDong != null ? String(sellDong) : "");
  if (!linkedText) {
    throw new Error("Dòng bảng giá đã chọn chưa có giá bán để liên kết.");
  }
  return {
    priceText: linkedText,
    priceNumeric: parsePriceNumeric(linkedText) ?? sellDong,
    priceSourceProduct: String(row.data.product ?? "").trim() || null,
  };
}

async function loadProductSnapshot(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  productId: string,
) {
  const result = await supabase
    .from("products")
    .select(
      "id, sort_order, name, category, price_text, image, updated_at, brand_id, category_id, slug, is_featured, is_best_seller, is_hot, is_active, price_numeric, price_source_product, weight, price_row_id, gold_age, product_type_id",
    )
    .eq("id", productId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Không tìm thấy sản phẩm.");
  return result.data;
}

async function loadLinkedSkuSummary(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  productId: string,
) {
  const sku = await supabase
    .from("pos_skus")
    .select("id, sku, is_active, is_order_jewelry")
    .eq("catalog_product_id", productId)
    .maybeSingle();
  if (sku.error) throw new Error(sku.error.message);
  return sku.data;
}

async function writeHistory(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  payload: {
    action: string;
    entityName: string;
    entityId?: string | null;
    summary?: string | null;
    body?: Record<string, unknown> | null;
  },
): Promise<void> {
  if (!PRODUCT_HISTORY_ENABLED) return;
  const result = await supabase.from("product_change_log").insert({
    action: payload.action,
    entity_name: payload.entityName,
    entity_id: payload.entityId ?? null,
    summary: payload.summary ?? null,
    payload: payload.body ?? null,
  });
  if (result.error) throw new Error(result.error.message);
}

async function refreshRow(productId: string | null, skuId: string | null): Promise<ProductAdminRow | null> {
  return getProductAdminRow(productId, skuId);
}

function buildChangedFields(
  before: Awaited<ReturnType<typeof loadProductSnapshot>>,
  after: Record<string, unknown>,
): string[] {
  const keys = [
    "name",
    "brand_id",
    "category_id",
    "category",
    "product_type_id",
    "price_row_id",
    "price_text",
    "price_numeric",
    "price_source_product",
    "weight",
    "gold_age",
    "image",
    "is_featured",
    "is_best_seller",
    "is_hot",
    "is_active",
  ] as const;
  const changed: string[] = [];
  for (const key of keys) {
    const prev = before[key];
    const next = after[key];
    if (JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null)) {
      changed.push(key);
    }
  }
  return changed;
}

export async function createProductAdmin(
  input: ProductFormInput,
): Promise<ActionResult<{ row: ProductAdminRow }>> {
  return runAction(async () => {
    await assertAdminWrite();
    validateProductInput(input, "create");
    const supabase = await createServerSupabase();
    await ensureClassificationAllowed(supabase, input, null);
    const priceLink = await resolvePriceLink(supabase, input.priceRowId, input.priceText);

    const productId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = await resolveSlug(supabase, input.name, null, null);
    const sortOrder = await resolveSortOrder(supabase, null);
    const categoryText = await resolveCategoryText(supabase, input.categoryId, "");
    const row = {
      id: productId,
      sort_order: sortOrder,
      name: input.name.trim(),
      slug,
      category: categoryText,
      price_text: priceLink.priceText,
      price_numeric: priceLink.priceNumeric,
      price_source_product: priceLink.priceSourceProduct,
      image: input.imageUrl.trim(),
      brand_id: input.brandId,
      category_id: input.categoryId,
      product_type_id: input.productTypeId,
      price_row_id: input.priceRowId,
      weight: normalizeWeight(input.weightChi),
      gold_age: normalizeGoldAge(input.goldAge),
      is_featured: input.isFeatured,
      is_best_seller: input.isBestSeller,
      is_hot: input.isHot,
      is_active: input.isActive,
    };
    const result = await supabase.from("products").insert(row);
    if (result.error) throw new Error(result.error.message);

    await writeHistory(supabase, {
      action: "product_insert",
      entityName: row.name,
      entityId: row.id,
      summary: "Tạo sản phẩm từ POS Admin",
      body: { after: row, kind: "PRODUCT" },
    });

    revalidateProductViews();
    const saved = await refreshRow(productId, null);
    if (!saved) throw new Error("Lưu xong nhưng không tải lại được sản phẩm.");
    return { row: saved };
  }, "Không tạo được sản phẩm.");
}

export async function updateProductAdmin(
  productId: string,
  input: ProductFormInput,
): Promise<ActionResult<{ row: ProductAdminRow; changedFields: string[] }>> {
  return runAction(async () => {
    await assertAdminWrite();
    validateProductInput(input, "update");
    const supabase = await createServerSupabase();
    const before = await loadProductSnapshot(supabase, productId);
    await ensureClassificationAllowed(supabase, input, before);
    const priceLink = await resolvePriceLink(supabase, input.priceRowId, input.priceText);
    const priceSourceProduct = input.priceRowId
      ? priceLink.priceSourceProduct
      : before.price_row_id
        ? null
        : ((before.price_source_product as string | null | undefined) ?? null);

    const slug = await resolveSlug(supabase, input.name, productId, before.slug);
    const categoryText = await resolveCategoryText(supabase, input.categoryId, before.category ?? "");
    const row = {
      sort_order: before.sort_order ?? (await resolveSortOrder(supabase, productId)),
      name: input.name.trim(),
      slug,
      category: categoryText,
      price_text: priceLink.priceText,
      price_numeric: priceLink.priceNumeric,
      price_source_product: priceSourceProduct,
      image: input.imageUrl.trim(),
      brand_id: input.brandId,
      category_id: input.categoryId,
      product_type_id: input.productTypeId,
      price_row_id: input.priceRowId,
      weight: normalizeWeight(input.weightChi),
      gold_age: normalizeGoldAge(input.goldAge),
      is_featured: input.isFeatured,
      is_best_seller: input.isBestSeller,
      is_hot: input.isHot,
      is_active: input.isActive,
    };
    const changedFields = buildChangedFields(before, row);
    if (changedFields.length === 0) {
      const unchanged = await refreshRow(productId, null);
      if (!unchanged) throw new Error("Không tải lại được sản phẩm.");
      return { row: unchanged, changedFields };
    }

    const result = await supabase.from("products").update(row).eq("id", productId);
    if (result.error) throw new Error(result.error.message);

    await writeHistory(supabase, {
      action: "product_update",
      entityName: row.name,
      entityId: productId,
      summary: `Cập nhật sản phẩm (${changedFields.join(", ")})`,
      body: { before, after: row, changed_fields: changedFields, kind: "PRODUCT" },
    });

    revalidateProductViews();
    const saved = await refreshRow(productId, null);
    if (!saved) throw new Error("Lưu xong nhưng không tải lại được sản phẩm.");
    return { row: saved, changedFields };
  }, "Không cập nhật được sản phẩm.");
}

export async function setProductAdminActive(
  productId: string,
  isActive: boolean,
): Promise<ActionResult<{ row: ProductAdminRow }>> {
  return runAction(async () => {
    await assertAdminWrite();
    const supabase = await createServerSupabase();
    const before = await loadProductSnapshot(supabase, productId);
    const result = await supabase
      .from("products")
      .update({ is_active: isActive, is_featured: isActive ? before.is_featured : false })
      .eq("id", productId);
    if (result.error) throw new Error(result.error.message);

    await writeHistory(supabase, {
      action: "product_status",
      entityName: String(before.name ?? ""),
      entityId: productId,
      summary: isActive ? "Bật lại sản phẩm" : "Ẩn sản phẩm",
      body: {
        before: { is_active: before.is_active },
        after: { is_active: isActive },
        changed_fields: ["is_active"],
        kind: "PRODUCT",
      },
    });

    revalidateProductViews();
    const row = await refreshRow(productId, null);
    if (!row) throw new Error("Không tải lại được sản phẩm.");
    return { row };
  }, "Không đổi được trạng thái sản phẩm.");
}

export async function deleteProductAdmin(
  productId: string,
): Promise<ActionResult<{ productId: string; orphanRow: ProductAdminRow | null }>> {
  return runAction(async () => {
    await assertAdminWrite();
    const supabase = await createServerSupabase();
    const before = await loadProductSnapshot(supabase, productId);
    const linkedSku = await loadLinkedSkuSummary(supabase, productId);
    const result = await supabase.from("products").delete().eq("id", productId);
    if (result.error) throw new Error(result.error.message);

    await writeHistory(supabase, {
      action: "product_delete",
      entityName: String(before.name ?? ""),
      entityId: productId,
      summary: linkedSku?.id
        ? "Xóa sản phẩm. Mã hàng kho liên kết vẫn còn và chuyển sang trạng thái chưa gắn sản phẩm."
        : "Xóa sản phẩm",
      body: {
        before,
        linked_sku: linkedSku
          ? {
              sku_id: linkedSku.id,
              sku: linkedSku.sku,
              is_active: linkedSku.is_active,
              is_order_jewelry: linkedSku.is_order_jewelry,
            }
          : null,
        kind: "PRODUCT",
      },
    });

    revalidateProductViews();
    const orphanRow = linkedSku?.id ? await refreshRow(null, String(linkedSku.id)) : null;
    return { productId, orphanRow };
  }, "Không xóa được sản phẩm.");
}

export async function setOrphanSkuAdminActive(
  skuId: string,
  isActive: boolean,
): Promise<ActionResult<{ row: ProductAdminRow }>> {
  return runAction(async () => {
    await assertAdminWrite();
    const supabase = await createServerSupabase();
    const result = await supabase.rpc("pos_set_product_admin_sku_active", {
      p_sku_id: skuId,
      p_is_active: isActive,
      p_reason: "Quan ly san pham POS Admin",
      p_write_audit: PRODUCT_HISTORY_ENABLED,
    });
    if (result.error) throw new Error(result.error.message);
    revalidateProductViews();
    const row = await refreshRow(null, skuId);
    if (!row) throw new Error("Không tải lại được mã hàng.");
    return { row };
  }, "Không đổi được trạng thái mã hàng.");
}

export async function listProductAdminPageAction(
  filter: ProductAdminListFilter,
): Promise<ActionResult<ProductAdminPagePayload>> {
  return runAction(async () => {
    await assertAdminRead();
    return listProductAdminPage(filter);
  }, "Không tải được danh sách sản phẩm.");
}

export async function assertProductAdminRead(): Promise<ActionResult<{ ok: true }>> {
  try {
    await assertAdminRead();
    return actionOk({ ok: true });
  } catch (err) {
    return actionFail(formatActionError(err));
  }
}

export async function assertProductAdminWrite(): Promise<ActionResult<{ ok: true }>> {
  try {
    await assertAdminWrite();
    return actionOk({ ok: true });
  } catch (err) {
    return actionFail(formatActionError(err));
  }
}

export async function probeSkuTogglePermission(): Promise<ActionResult<{ available: boolean }>> {
  try {
    await assertAdminRead();
    const supabase = await createServerSupabase();
    const probe = await supabase.rpc("pos_set_product_admin_sku_active", {
      p_sku_id: "00000000-0000-0000-0000-000000000000",
      p_is_active: false,
      p_reason: "probe",
      p_write_audit: false,
    });
    if (probe.error && !/khong tim thay|not found/i.test(probe.error.message)) {
      return actionFailFromSupabase(probe.error);
    }
    return actionOk({ available: true });
  } catch (err) {
    return actionFail(formatActionError(err));
  }
}
