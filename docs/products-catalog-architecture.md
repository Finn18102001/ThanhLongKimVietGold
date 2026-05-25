# TLKV Product Catalog — Architecture (Steps 1–12)

## Implemented modules (Steps 8–12)

| Step | Files |
|------|--------|
| 8 Homepage | `js/products/homepage-catalog.js`, `section-registry.js`, `#homepage-products` on `index.html` |
| 9 Filters | `js/products/catalog-filters.js`, `catalog-archive.js`, toolbar on `san-pham/index.html` |
| 10 Admin | `js/admin/catalog-admin.js`, extended `admin/index.html` |
| 11 Perf | sessionStorage cache 60s on homepage, paginated `.range()`, lazy images |
| 12 SEO | `routes/web.js` paths, `san-pham/chi-tiet.html`, `thuong-hieu/index.html` |

**SQL:** run `supabase/products-catalog-step8-12.sql` for `price_numeric`.

---

# TLKV Product Catalog — Foundation Architecture (Steps 1–7)

Production foundation for `/sanpham`. **tv-model is out of scope** (do not import or modify gold TV modules).

## Stack note

Live repo: **Express + vanilla JS + Supabase** (this implementation).  
If you migrate to **Next.js + Tailwind**, keep the same schema and map components:

| This repo | Next.js equivalent |
|-----------|-------------------|
| `js/products/brand-section.js` | `components/catalog/BrandSection.tsx` |
| `js/products/product-card.js` | `components/catalog/ProductCard.tsx` |
| `js/products/catalog-api.js` | `lib/catalog/queries.ts` (Server Component fetch) |

---

## Step 1 — Brand architecture

**Table:** `public.brands`  
**FK:** `products.brand_id → brands.id`

| Column | Type | Purpose |
|--------|------|---------|
| `slug` | `text unique` | URL + storage paths |
| `logo_url` | `text` | Section header |
| `is_active` | `boolean` | Hide brand without deleting |
| `sort_order` | `int` | Homepage / catalog order |

**Indexes:** `(is_active, sort_order, name)`

**Why not text `brand` on products?**

- One source of truth for logo, copy, slug
- Admin toggles brand visibility once
- Filters: `WHERE brand_id = $1` uses index; `WHERE brand ILIKE '%...%'` does not scale

**SQL:** `supabase/products-catalog-schema.sql`

---

## Step 2 — Category architecture

**Table:** `public.categories` with nullable `parent_id` (hierarchy later, flat today).

**FK:** `products.category_id → categories.id`

Legacy `products.category` text kept during migration; backfill via `tlkv_slugify(category) = categories.slug`.

**Future hierarchy:** query `WHERE parent_id IS NULL` for roots; children via `parent_id`. No schema break required.

---

## Step 3 — Product flags

On `products`:

| Flag | Type | Default | Use |
|------|------|---------|-----|
| `is_featured` | `boolean` | false | Hero / spotlight blocks |
| `is_best_seller` | `boolean` | false | “Bán chạy” sections |
| `is_hot` | `boolean` | false | Promo ribbons |
| `is_active` | `boolean` | true | Public visibility |
| `sort_order` | `int` | null | Tie-break within flag groups |

**Sort strategy (homepage):**

```sql
ORDER BY is_featured DESC, is_best_seller DESC, is_hot DESC,
         sort_order ASC NULLS LAST, name ASC
```

**Why flags beat hardcoded sections**

- Marketing changes layout without deploys
- Same `ProductCard` renders featured, hot, or brand grids
- Admin: boolean toggles + `sort_order` (no “section id” enum soup)

**Index:** `idx_products_flags_homepage` (partial `WHERE is_active`)

---

## Step 4 — Image architecture

**Table:** `product_images` — one row per asset, `role ∈ {thumbnail, main, gallery}`.

Unique partial indexes: one `thumbnail`, one `main` per product.

**Storage:** bucket `product-media` — see `supabase/products-storage.sql`

```
product-media/products/<product-id>/thumbnail/<uuid>.webp
product-media/products/<product-id>/gallery/<uuid>.webp
```

**Upload flow (admin, later):**

1. Upload to Storage → get public URL  
2. Insert `product_images` row with `storage_path` + `public_url`  
3. Card reads `thumbnail` first, then `main`, then legacy `products.image`

**Why single `image` is insufficient**

- Different crops for grid vs detail  
- Gallery without JSON blobs in `products`  
- WebP variants: add `format` column or path suffix later without migration pain

**Frontend:** `loading="lazy"`, `decoding="async"`, `object-fit: contain`, fixed `aspect-ratio` on media (see `css/products-catalog.css`).

---

## Step 5 — Product card system

**Only:** image, name, price, **Liên hệ** → `https://zalo.me/0995682568` (existing integration).

**Layout rules:**

- Card = column flex; body grows; CTA `margin-top: auto`  
- Name: `-webkit-line-clamp: 2` + `min-height` for row alignment  
- Media: `aspect-ratio: 4/3` — stable grid rhythm

**Module:** `js/products/product-card.js`

---

## Step 6 — Section-based frontend

```
BrandSection
 └── ProductGrid
      └── ProductCard
```

**Folder:**

```
js/products/
  constants.js
  catalog-api.js      # Supabase fetch + normalize
  catalog-page.js     # mount #product-list
  brand-section.js
  product-grid.js
  product-card.js
css/products-catalog.css
```

**Data flow:**

1. `TLKVCatalogApi.fetchBrandCatalogSections()` — nested `brands → products → product_images`  
2. Normalize to view models  
3. `TLKVCatalogPage.mountCatalogPage()` renders sections  
4. Fallback: flat `TLKVProducts.getProducts()` if schema not deployed

**Why not `products.map` on the page**

- Brand boundaries, limits (4–6), and headers belong at section level  
- Homepage can reuse `BrandSection` with different `limit` / flag filters  
- Flat map forces copy-paste for every new merchandising block → technical debt

---

## Step 7 — Brand section structure

**Per section:** logo (optional), name, optional description, grid max 6 products.

No “Xem thêm”, no category mega-CTAs.

**Responsive:**

| Breakpoint | Grid | Header |
|------------|------|--------|
| Desktop ≥992 | 4 columns | Logo + text row |
| Tablet 576–991 | 2 columns | Same |
| Mobile &lt;576 | 1 column, max-width 360px | Stacked header |

**Module:** `js/products/brand-section.js`

---

## Admin implications (foundation only)

Current `/admin` still uses legacy flat `products` CRUD. After schema deploy:

1. Brand/category CRUD screens (dropdowns, not free text)  
2. Flag toggles on product form  
3. Multi-image upload → `product_images`  
4. Assign `brand_id` / `category_id` on save  

Audit: extend `product_change_log` payloads with `brand_id` / flags (pattern exists in `js/admin-audit.js`).

---

## Deploy checklist

1. Run `supabase/products-catalog-schema.sql`  
2. Run `supabase/products-storage.sql`  
3. Assign `brand_id` / `category_id` in Table Editor for existing rows  
4. Reload `/sanpham` — sections appear when brands have active products  
5. Enable Realtime on `products`, `brands` if live updates needed  

---

## Scalability summary

| Concern | Mechanism |
|---------|-----------|
| More brands | Rows in `brands`, no code change |
| Homepage blocks | Query by flags, not hardcoded HTML |
| Categories tree | `parent_id` already on `categories` |
| Images / WebP | `product_images` + Storage paths |
| tv-model safety | Zero imports from `js/tv-gold-board.js` / `tv-model.html` |
