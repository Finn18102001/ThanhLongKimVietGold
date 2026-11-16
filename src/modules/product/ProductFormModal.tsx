"use client";

import { useMemo, useState } from "react";
import { formatDong } from "@/shared/lib/money";
import { Modal } from "@/shared/ui/Modal";
import { ResultAlert, type ResultAlertModel } from "@/shared/ui/ResultAlert";
import type {
  ProductAdminRow,
  ProductBrandCategoryLink,
  ProductFormInput,
  ProductPriceRowOption,
  ProductTaxonomyOption,
} from "./types";

const FIELD =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-line)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)] disabled:bg-[var(--tlkv-bg)]";
const FIELD_ERROR =
  "mt-1 h-10 w-full rounded-lg border border-[var(--tlkv-red)] px-3 text-[13px] outline-none focus:border-[var(--tlkv-red)] disabled:bg-[var(--tlkv-bg)]";

type Mode = "create" | "edit" | "view";
type FieldKey = "name" | "brandId" | "categoryId" | "weightChi" | "goldAge" | "priceRowId" | "priceText";
type FieldErrors = Partial<Record<FieldKey, string>>;

function fieldClass(hasError: boolean): string {
  return hasError ? FIELD_ERROR : FIELD;
}

function normalizeBrandKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function brandsMatch(a: string, b: string): boolean {
  const left = normalizeBrandKey(a);
  const right = normalizeBrandKey(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function purityToGoldAge(purity: string | null | undefined): string {
  if (!purity) return "";
  const normalized = String(purity).trim().replace(",", ".");
  const n = Number(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return "";
  return String(Math.round(n * 1000) / 1000);
}

function parseWeightInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100000) / 100000;
}

function parseGoldAgeInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  return Math.round(n * 1000) / 1000;
}

export function ProductFormModal({
  title,
  mode,
  initial,
  brands,
  categories,
  brandCategories,
  productTypes,
  priceRows,
  pending = false,
  onClose,
  onSave,
}: {
  title: string;
  mode: Mode;
  initial?: ProductAdminRow | null;
  brands: ProductTaxonomyOption[];
  categories: ProductTaxonomyOption[];
  brandCategories: ProductBrandCategoryLink[];
  productTypes: ProductTaxonomyOption[];
  priceRows: ProductPriceRowOption[];
  pending?: boolean;
  onClose: () => void;
  onSave?: (input: ProductFormInput) => Promise<void> | void;
}) {
  const readOnly = mode === "view" || initial?.kind === "ORPHAN_SKU";
  const [alert, setAlert] = useState<ResultAlertModel | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [name, setName] = useState(initial?.name ?? "");
  const [brandId, setBrandId] = useState(initial?.brandId ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [productTypeId, setProductTypeId] = useState(initial?.productTypeId ?? "");
  const [priceRowId, setPriceRowId] = useState(initial?.priceRowId ?? "");
  const [priceText, setPriceText] = useState(initial?.priceText ?? "");
  const [weightChi, setWeightChi] = useState(initial?.weightChi != null ? String(initial.weightChi) : "");
  const [goldAge, setGoldAge] = useState(initial?.goldAge != null ? String(initial.goldAge) : "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [isBestSeller, setIsBestSeller] = useState(initial?.isBestSeller ?? false);
  const [isHot, setIsHot] = useState(initial?.isHot ?? false);
  const [isActive, setIsActive] = useState(initial?.productActive ?? true);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === brandId) ?? null,
    [brandId, brands],
  );

  const linkedCategories = useMemo(() => {
    if (!brandId) return [];
    const allowed = new Set(
      brandCategories.filter((link) => link.brandId === brandId).map((link) => link.categoryId),
    );
    return categories.filter((category) => allowed.has(category.id));
  }, [brandCategories, brandId, categories]);

  const visiblePriceRows = useMemo(() => {
    const byVisibility = priceRows.filter((row) => row.isVisibleOnWebsite || row.id === priceRowId);
    if (!selectedBrand) return byVisibility;
    const matched = byVisibility.filter((row) => brandsMatch(row.brandLabel, selectedBrand.name));
    if (priceRowId && !matched.some((row) => row.id === priceRowId)) {
      const kept = byVisibility.find((row) => row.id === priceRowId);
      return kept ? [...matched, kept] : matched;
    }
    return matched;
  }, [priceRowId, priceRows, selectedBrand]);

  const selectedPriceRow = useMemo(
    () => visiblePriceRows.find((row) => row.id === priceRowId) ?? null,
    [priceRowId, visiblePriceRows],
  );

  function clearError(key: FieldKey) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function changeBrand(nextBrandId: string) {
    setBrandId(nextBrandId);
    clearError("brandId");
    clearError("categoryId");
    const stillLinked = brandCategories.some(
      (link) => link.brandId === nextBrandId && link.categoryId === categoryId,
    );
    if (!stillLinked) setCategoryId("");

    const brand = brands.find((item) => item.id === nextBrandId);
    if (priceRowId && brand) {
      const row = priceRows.find((item) => item.id === priceRowId);
      if (row && !brandsMatch(row.brandLabel, brand.name)) {
        setPriceRowId("");
        setPriceText("");
        clearError("priceRowId");
        clearError("priceText");
      }
    }
  }

  function applyPriceRow(nextId: string) {
    setPriceRowId(nextId);
    clearError("priceRowId");
    if (!nextId) {
      clearError("priceText");
      return;
    }
    const row = priceRows.find((item) => item.id === nextId);
    if (!row) return;
    if (row.sellDong != null) {
      setPriceText(String(row.sellDong));
      clearError("priceText");
    } else {
      setPriceText("");
      setErrors((prev) => ({
        ...prev,
        priceText: "Dòng bảng giá này chưa có giá bán. Chọn dòng khác hoặc nhập ghi chú thủ công.",
      }));
    }
    const fromPurity = purityToGoldAge(row.purity);
    if (fromPurity) {
      setGoldAge(fromPurity);
      clearError("goldAge");
    }
  }

  function validateFields(): FieldErrors {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Bắt buộc nhập tên sản phẩm.";
    if (!brandId.trim()) next.brandId = "Bắt buộc chọn thương hiệu.";

    if (categoryId) {
      const linked = brandCategories.some(
        (link) => link.brandId === brandId && link.categoryId === categoryId,
      );
      if (!linked) {
        next.categoryId =
          "Danh mục này không thuộc thương hiệu đã chọn. Chọn lại danh mục trong danh sách của thương hiệu đó.";
      }
    }

    if (mode === "create" && !weightChi.trim()) {
      next.weightChi = "Bắt buộc nhập định lượng (chỉ) khi tạo sản phẩm.";
    } else if (weightChi.trim() && parseWeightInput(weightChi) == null) {
      next.weightChi = "Định lượng phải là số lớn hơn 0.";
    }

    if (goldAge.trim() && parseGoldAgeInput(goldAge) == null) {
      next.goldAge = "Tuổi vàng phải lớn hơn 0 và không quá 1000.";
    }

    if (priceRowId) {
      if (!selectedPriceRow) {
        next.priceRowId = "Dòng bảng giá không hợp lệ với thương hiệu hiện tại.";
      } else if (selectedBrand && !brandsMatch(selectedPriceRow.brandLabel, selectedBrand.name)) {
        next.priceRowId = "Dòng bảng giá phải cùng thương hiệu với sản phẩm.";
      } else if (selectedPriceRow.sellDong == null && !priceText.trim()) {
        next.priceText = "Dòng bảng giá chưa có giá bán để liên kết.";
      } else if (!priceText.trim()) {
        next.priceText = "Đã chọn dòng giá nhưng chưa có giá / ghi chú.";
      }
    }

    return next;
  }

  async function submit() {
    if (!onSave) return;
    const nextErrors = validateFields();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setAlert({
        tone: "error",
        title: mode === "create" ? "Thiếu thông tin bắt buộc" : "Không lưu được",
        reason: "Kiểm tra các ô báo đỏ bên dưới form.",
      });
      return;
    }
    try {
      await onSave({
        name: name.trim(),
        brandId: brandId.trim(),
        categoryId: categoryId || null,
        productTypeId: productTypeId || null,
        priceRowId: priceRowId || null,
        priceText: priceText.trim(),
        weightChi: weightChi.trim() ? Number(weightChi.replace(",", ".")) : null,
        goldAge: goldAge.trim() ? Number(goldAge.replace(",", ".")) : null,
        imageUrl: imageUrl.trim(),
        isFeatured,
        isBestSeller,
        isHot,
        isActive,
      });
    } catch (err) {
      setAlert({
        tone: "error",
        title: mode === "create" ? "Tạo sản phẩm thất bại" : "Lưu sản phẩm thất bại",
        reason: err instanceof Error ? err.message : "Không lưu được sản phẩm.",
      });
    }
  }

  return (
    <>
      <Modal
        title={title}
        wide="xl"
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-[var(--tlkv-line)] px-4 text-[13px] font-medium hover:bg-[var(--tlkv-bg)]"
            >
              {readOnly ? "Đóng" : "Hủy"}
            </button>
            {!readOnly ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void submit()}
                className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {pending ? "Đang lưu..." : mode === "create" ? "Tạo sản phẩm" : "Lưu thay đổi"}
              </button>
            ) : null}
          </>
        }
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-[13px] md:col-span-2">
                Tên sản phẩm <span className="text-[var(--tlkv-red)]">*</span>
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    clearError("name");
                  }}
                  disabled={readOnly}
                  className={fieldClass(Boolean(errors.name))}
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name ? <p className="mt-1 text-[12px] text-[var(--tlkv-red)]">{errors.name}</p> : null}
              </label>
              <label className="text-[13px]">
                Thương hiệu <span className="text-[var(--tlkv-red)]">*</span>
                <select
                  value={brandId}
                  onChange={(event) => changeBrand(event.target.value)}
                  disabled={readOnly}
                  className={fieldClass(Boolean(errors.brandId))}
                  aria-invalid={Boolean(errors.brandId)}
                >
                  <option value="">Chọn thương hiệu</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                      {brand.isActive ? "" : " (ngừng dùng)"}
                    </option>
                  ))}
                </select>
                {errors.brandId ? (
                  <p className="mt-1 text-[12px] text-[var(--tlkv-red)]">{errors.brandId}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
                    Chọn trước. Danh mục và dòng bảng giá sẽ lọc theo thương hiệu này.
                  </p>
                )}
              </label>
              <label className="text-[13px]">
                Danh mục
                <select
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    clearError("categoryId");
                  }}
                  disabled={readOnly || !brandId}
                  className={fieldClass(Boolean(errors.categoryId))}
                  aria-invalid={Boolean(errors.categoryId)}
                >
                  <option value="">{brandId ? "Không chọn" : "Chọn thương hiệu trước"}</option>
                  {linkedCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.isActive ? "" : " (ngừng dùng)"}
                    </option>
                  ))}
                </select>
                {errors.categoryId ? (
                  <p className="mt-1 text-[12px] text-[var(--tlkv-red)]">{errors.categoryId}</p>
                ) : brandId && linkedCategories.length === 0 ? (
                  <p className="mt-1 text-[12px] text-amber-700">
                    Thương hiệu này chưa có danh mục liên kết. Vào tab Danh mục để gắn, hoặc để trống.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
                    Chỉ hiện danh mục đã gắn với thương hiệu đã chọn.
                  </p>
                )}
              </label>
              <label className="text-[13px]">
                Loại sản phẩm
                <select
                  value={productTypeId}
                  onChange={(event) => setProductTypeId(event.target.value)}
                  disabled={readOnly}
                  className={FIELD}
                >
                  <option value="">Chưa phân loại</option>
                  {productTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                      {type.isActive ? "" : " (ngừng dùng)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[13px]">
                Dòng bảng giá
                <select
                  value={priceRowId}
                  onChange={(event) => applyPriceRow(event.target.value)}
                  disabled={readOnly || !brandId}
                  className={fieldClass(Boolean(errors.priceRowId))}
                  aria-invalid={Boolean(errors.priceRowId)}
                >
                  <option value="">{brandId ? "Không chọn" : "Chọn thương hiệu trước"}</option>
                  {visiblePriceRows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                      {row.isVisibleOnWebsite ? "" : " (đang ẩn)"}
                    </option>
                  ))}
                </select>
                {errors.priceRowId ? (
                  <p className="mt-1 text-[12px] text-[var(--tlkv-red)]">{errors.priceRowId}</p>
                ) : brandId && visiblePriceRows.length === 0 ? (
                  <p className="mt-1 text-[12px] text-amber-700">
                    Không có dòng bảng giá cùng thương hiệu. Kiểm tra bảng giá vàng hoặc chọn thương hiệu
                    khác.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
                    Chỉ hiện dòng bảng giá cùng thương hiệu. Sau khi chọn, hệ thống dùng giá bán và giá mua
                    theo dòng này khi bán hàng và nhập kho.
                  </p>
                )}
              </label>
              <label className="text-[13px]">
                Giá / ghi chú
                <input
                  value={priceText}
                  onChange={(event) => {
                    setPriceText(event.target.value);
                    clearError("priceText");
                  }}
                  disabled={readOnly}
                  className={fieldClass(Boolean(errors.priceText))}
                  aria-invalid={Boolean(errors.priceText)}
                  placeholder={priceRowId ? "Tự điền từ giá bán dòng bảng giá" : "Số tiền hoặc ghi chú"}
                />
                {errors.priceText ? (
                  <p className="mt-1 text-[12px] text-[var(--tlkv-red)]">{errors.priceText}</p>
                ) : selectedPriceRow ? (
                  <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
                    Liên kết: bán{" "}
                    {selectedPriceRow.sellDong != null ? formatDong(selectedPriceRow.sellDong) : "—"}
                    {" / chỉ"}
                    {selectedPriceRow.buyDong != null
                      ? ` · mua ${formatDong(selectedPriceRow.buyDong)} / chỉ`
                      : ""}
                  </p>
                ) : null}
              </label>
              <label className="text-[13px]">
                Định lượng (chỉ) {mode === "create" ? <span className="text-[var(--tlkv-red)]">*</span> : null}
                <input
                  value={weightChi}
                  onChange={(event) => {
                    setWeightChi(event.target.value);
                    clearError("weightChi");
                  }}
                  disabled={readOnly}
                  inputMode="decimal"
                  className={fieldClass(Boolean(errors.weightChi))}
                  aria-invalid={Boolean(errors.weightChi)}
                />
                {errors.weightChi ? (
                  <p className="mt-1 text-[12px] text-[var(--tlkv-red)]">{errors.weightChi}</p>
                ) : null}
              </label>
              <label className="text-[13px]">
                Tuổi vàng
                <input
                  value={goldAge}
                  onChange={(event) => {
                    setGoldAge(event.target.value);
                    clearError("goldAge");
                  }}
                  disabled={readOnly}
                  inputMode="decimal"
                  className={fieldClass(Boolean(errors.goldAge))}
                  aria-invalid={Boolean(errors.goldAge)}
                  placeholder="VD: 999.9"
                />
                {errors.goldAge ? (
                  <p className="mt-1 text-[12px] text-[var(--tlkv-red)]">{errors.goldAge}</p>
                ) : selectedPriceRow?.purity ? (
                  <p className="mt-1 text-[11px] text-[var(--tlkv-muted)]">
                    Gợi ý từ dòng giá: {selectedPriceRow.purity}
                  </p>
                ) : null}
              </label>
              <label className="text-[13px] md:col-span-2">
                URL ảnh
                <input
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  disabled={readOnly}
                  className={FIELD}
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-[var(--tlkv-bg)] px-4 py-3 text-[12px] text-[var(--tlkv-muted)]">
                <p className="font-semibold text-[var(--tlkv-text)]">Thông tin hệ thống</p>
                <p className="mt-1">Mã sản phẩm: {initial?.productId ?? "Tự sinh khi lưu"}</p>
                <p>Đường dẫn web: {initial?.slug || "Tự tạo từ tên"}</p>
                <p>Mã hàng: {initial?.sku ?? "Hệ thống tự đồng bộ"}</p>
                <p>
                  Loại bản ghi:{" "}
                  {initial?.kind === "ORPHAN_SKU" ? "Mã hàng chưa gắn sản phẩm" : "Sản phẩm danh mục"}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--tlkv-bg)] px-4 py-3 text-[12px] text-[var(--tlkv-muted)]">
                <p className="font-semibold text-[var(--tlkv-text)]">Trạng thái</p>
                <label className="mt-2 flex items-center gap-2 text-[13px] text-[var(--tlkv-text)]">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                    disabled={readOnly}
                  />
                  Sản phẩm đang hoạt động
                </label>
                <label className="mt-2 flex items-center gap-2 text-[13px] text-[var(--tlkv-text)]">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(event) => setIsFeatured(event.target.checked)}
                    disabled={readOnly}
                  />
                  Nổi bật
                </label>
                <label className="mt-2 flex items-center gap-2 text-[13px] text-[var(--tlkv-text)]">
                  <input
                    type="checkbox"
                    checked={isBestSeller}
                    onChange={(event) => setIsBestSeller(event.target.checked)}
                    disabled={readOnly}
                  />
                  Bán chạy
                </label>
                <label className="mt-2 flex items-center gap-2 text-[13px] text-[var(--tlkv-text)]">
                  <input
                    type="checkbox"
                    checked={isHot}
                    onChange={(event) => setIsHot(event.target.checked)}
                    disabled={readOnly}
                  />
                  Hot
                </label>
              </div>
            </div>

            {initial?.kind === "ORPHAN_SKU" ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
                Mã hàng này không còn gắn với sản phẩm danh mục. Màn hình này chỉ cho xem và ẩn/hiện trên POS,
                không cho sửa trực tiếp thông tin sản phẩm.
              </p>
            ) : null}
          </div>

          <aside className="rounded-lg border border-[var(--tlkv-line)] bg-[var(--tlkv-bg)] px-4 py-4 text-[12px] leading-relaxed text-[var(--tlkv-muted)] lg:sticky lg:top-0">
            <p className="text-[13px] font-semibold text-[var(--tlkv-text)]">Hướng dẫn tạo sản phẩm</p>
            <ol className="mt-3 list-decimal space-y-2 pl-4">
              <li>
                Chọn <span className="font-medium text-[var(--tlkv-text)]">Thương hiệu</span> trước (bắt buộc).
              </li>
              <li>
                Chọn <span className="font-medium text-[var(--tlkv-text)]">Danh mục</span> chỉ trong danh sách đã
                lọc. Mỗi thương hiệu chỉ dùng được các danh mục đã gắn sẵn (ví dụ TLKV → Trang Sức, Nhẫn Trơn,
                VÀNG 24K…). Chọn sai cặp sẽ bị chặn.
              </li>
              <li>
                Chọn <span className="font-medium text-[var(--tlkv-text)]">Dòng bảng giá</span> thuộc cùng thương
                hiệu với sản phẩm. Sau khi lưu, hệ thống sẽ tự động sử dụng giá mua và giá bán theo dòng bảng
                giá đã chọn khi thực hiện bán hàng và nhập kho. Giá được lấy trực tiếp từ bảng giá, không sử
                dụng giá nhập thủ công tại form này.
              </li>
              <li>
                Ô <span className="font-medium text-[var(--tlkv-text)]">Giá / ghi chú</span> tự điền giá bán /
                chỉ để hiển thị trên danh mục; không thay thế bảng giá vận hành.
              </li>
              <li>
                Nhập <span className="font-medium text-[var(--tlkv-text)]">Định lượng (chỉ)</span> đúng 1 chiếc để
                sinh mã hàng. <span className="font-medium text-[var(--tlkv-text)]">Tuổi vàng</span> tự gợi ý từ
                hàm lượng trên dòng bảng giá.
              </li>
            </ol>
            <div className="mt-4 rounded-lg border border-[var(--tlkv-line)] bg-white px-3 py-3">
              <p className="font-semibold text-[var(--tlkv-text)]">Cách chọn hợp lệ</p>
              <ul className="mt-2 space-y-1.5">
                <li>1) Thương hiệu → 2) Danh mục (đã gắn) → 3) Dòng bảng giá (cùng thương hiệu)</li>
                <li>
                  <span className="text-[var(--tlkv-red)]">*</span> Tên · Thương hiệu
                  {mode === "create" ? " · Định lượng" : ""}
                </li>
                <li>Danh mục trống danh sách = chưa liên kết ở tab Danh mục</li>
              </ul>
              <p className="mt-3 text-[11px]">
                Thiếu / sai cặp: viền đỏ + chữ đỏ dưới ô. Không lưu khi còn lỗi.
              </p>
            </div>
            {selectedPriceRow ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-900">
                <p className="font-semibold">Đã liên kết dòng bảng giá</p>
                <p className="mt-1">{selectedPriceRow.label}</p>
                <p className="mt-2">
                  Giá bán:{" "}
                  {selectedPriceRow.sellDong != null ? formatDong(selectedPriceRow.sellDong) : "—"} / chỉ
                </p>
                <p>
                  Giá mua:{" "}
                  {selectedPriceRow.buyDong != null ? formatDong(selectedPriceRow.buyDong) : "—"} / chỉ
                </p>
              </div>
            ) : (
              <p className="mt-4 text-[11px]">
                Chưa chọn dòng bảng giá: vẫn tạo được sản phẩm, nhưng bán hàng và nhập kho sẽ không tự lấy giá
                bán / giá mua theo bảng giá hiện hành.
              </p>
            )}
          </aside>
        </div>
      </Modal>

      {alert ? (
        <ResultAlert alert={alert} onClose={() => setAlert(null)}>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="h-10 rounded-lg bg-[var(--tlkv-red)] px-4 text-[13px] font-semibold text-white"
          >
            Đóng
          </button>
        </ResultAlert>
      ) : null}
    </>
  );
}
