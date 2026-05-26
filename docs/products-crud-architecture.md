# Product CRUD & Featured Products — Architecture

## Layering

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Domain rules | `js/products/product-crud.js` | Validation, featured filter contract, limits |
| Persistence | `js/products-data.js` | Supabase CRUD, normalize, slug, sort_order |
| Public read | `js/products/catalog-api.js` | Homepage featured, catalog pagination |
| Admin form | `js/admin/product-form-admin.js` | Form state, DOM, slug preview |
| Admin shell | `js/admin/catalog-admin.js` | Submit orchestration, tables |
| Render | `js/products/brand-section.js`, `homepage-catalog.js` | Display only — no business filters |

## CREATE

1. `TLKVProductFormAdmin.resetToCreateMode()` — clean form defaults.
2. Submit → `buildPayload()` → `TLKVProductCrud.validateForSave()` → `TLKVProducts.saveProduct()`.
3. `saveProduct`: admin session check → `normalizeItem` → `resolveSortOrderForSave` (max+1) → `productAppToDb` → upsert.
4. Success → `resetToCreateMode()` (create) or `loadForEdit(saved)` (update).
5. `tlkv:products-changed` + homepage cache invalidate.

**Defaults:** `is_active=true`, toggles false except user choice; slug auto on create; sort_order auto.

## READ

- **Catalog `/san-pham`:** `fetchProductsPage` — server filters `is_active`, pagination, optional flags.
- **Admin table:** `TLKVProducts.getProducts()` — full list, client sort by `sort_order`.
- **Homepage:** `fetchHomeFeaturedBrandSections` — all products, group by `brand_id`, max 6/brand (temporary).

## UPDATE

- Edit loads via `loadForEdit(item)` — `originalSlug` locked for SEO.
- Upsert by `id`; relational `brand_id` / `category_id` written atomically.

## DELETE

- **Current:** hard delete (`delete().eq('id')`).
- **Production recommendation:** prefer `is_active=false` for soft delete; reserve hard delete for admin confirm + future storage cleanup job.
- Orphan storage: optional follow-up to delete `product-media` objects by prefix.

## Homepage brand sections (temporary)

1. `fetchAllBrandsForHomepage()` — load all brands from API first.
2. `fetchAllProductsForHomepage()` — load all products, no `is_active` / `is_featured` filter.
3. `buildRenderableBrandSections()` — merge config↔API brand (match `slug`/`name`), group by `product.brand_id`, max **6**/brand, render only mapped brands with products.

Re-enable featured/active filters later in one place (`product-crud.js` + catalog-api).

## RLS

- Public: SELECT all rows (or active-only per policy).
- Write: JWT admin email policy — same Supabase client as login (`TLKVSupabase`).

## Anti-patterns removed

- Duplicate Supabase clients for admin vs save.
- `created_at` / `updated_at` sort attempts causing 400.
- Frontend slicing featured list below server truth (home uses full server list).
- Legacy admin form parallel save when `#pf-brand-id` exists (catalog hook only).
