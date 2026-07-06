# Product CRUD & Cache Egress Optimization Report

**Project:** Website Thăng Long Kim Việt (`yrdqnmsvwovwhepmhigv`)  
**Date:** 2026-07-06  
**Framework:** `Technical_Review_Cache_Egress_Investigation.md`  
**Stack:** Vanilla JS + Express + Supabase (Postgres, Storage, Auth) — no React/SWR/React Query

---

## Executive Summary

Cache Egress growth was driven primarily by **short-lived product image cache headers** (`max-age=3600`), **full DOM rebuilds on gold price SSE** (re-downloading product thumbnails), **N+1 Supabase queries** on catalog pages, and a **split image model** (`products.image` vs `product_images`) where admin writes only the legacy column.

This pass applied targeted fixes without breaking APIs or realtime pricing:

| Area | Before | After |
|------|--------|-------|
| Product upload `Cache-Control` | 1 hour (`3600`) | 1 year (`31536000`) + immutable paths |
| `product_images` sync on save | Never written from JS | Upserted on `saveProduct()` |
| Featured brands query | 1 query per brand (N+1) | 1 batched query |
| Accumulation page query | 1 query per brand (N+1) | 1 batched query |
| Gold SSE on `/san-pham/vang-tich-luy` | Full grid re-render → image refetch | DOM price patch only |
| Featured section signature | Ignored `thumbnailUrl` | Includes image URL in change detection |
| Admin product table thumbs | `p.image` only | `thumbnailUrl \|\| image` + lazy decode |

**Estimated impact:** 60–85% reduction in repeat product image egress for active sessions with SSE (price ticks every few seconds), plus improved CDN hit ratio for newly uploaded product images.

---

## Root Cause Analysis

### Primary causes

1. **`cacheControl: '3600'` on product uploads** (`js/admin-app.js`)  
   News images use `31536000`; products used 1-hour TTL. Browsers and Supabase CDN revalidated or re-fetched images hourly even when URLs were unchanged.

2. **Gold SSE triggered full product grid rebuild** (`vang-tich-luy-page.js`)  
   Each `tlkv:gold-rows-updated` called `renderBrandView()` → `renderProductGrid()` which destroys and recreates all `<img>` nodes, causing new network requests (often cache revalidation or miss with short TTL).

3. **Unstable upload filenames** (`product-{timestamp}-{random}.ext`)  
   Every re-upload created a new URL, invalidating CDN/browser cache for that product slot.

### Secondary causes

4. **`product_images` table never synced from admin** — public catalog prefers `product_images.public_url` via `pickImageUrl()` but saves only `products.image`, causing inconsistent URLs and missed optimization paths.

5. **N+1 catalog queries** — `fetchFeaturedBrandsWithProducts` and `fetchAccumulationByBrands` looped per brand, increasing API latency and encouraging full-page reload patterns.

6. **`buildSignature()` omitted `thumbnailUrl`** — image-only admin changes might not trigger featured section refresh when needed (stale thumbs) or conversely caused unnecessary full renders when combined with other refresh paths.

### Architectural weaknesses

- **No server-side image pipeline for products** (news has Sharp/WebP via `/api/news/upload-image`; products upload raw client files).
- **No responsive variants** (thumbnail/medium/large) — all surfaces load the same full-size asset.
- **No signed URLs** — all storage is public `getPublicUrl()`; bots can crawl images (see § Bot traffic).
- **Hardcoded Supabase credentials in `admin-app.js`** — operational risk, not egress directly.

---

## Product CRUD Findings

### Create / Update / Delete

| Operation | Path | Finding |
|-----------|------|---------|
| Create/Update | `products-data.js` → `saveProduct()` | Direct Supabase upsert; dispatches `tlkv:products-changed` |
| Delete | `deactivateProductById` / `deleteProductById` | Hard delete does not remove storage files (orphan risk) |
| List (admin) | `getProducts()` → `fetchProductsFromSupabase` | Joins `product_images`; now maps `thumbnailUrl` |
| List (public) | `catalog-api.js` | Batched queries after fix |
| Detail | `fetchProductBySlugs` | Uses `normalizeProduct` + `thumbnailUrl` |

### Inefficient patterns (addressed or documented)

- **Admin table** used `p.image` only → fixed to `thumbnailUrl || image`.
- **Upload path** stored in hidden `pf-image-path` → passed as `imageStoragePath` for `product_images.storage_path`.
- **`tlkv:products-changed`** on accumulation page still does full `loadAndRender` — correct for CRUD; gold SSE no longer does.

### Realtime / SSE

| Event | Product images reloaded? |
|-------|--------------------------|
| `tlkv:gold-rows-updated` (homepage featured) | **No** — `patchFeaturedPricesInDom` |
| `tlkv:gold-rows-updated` (vang-tich-luy) | **Was yes** → **No** after `patchProductPricesInDom` |
| `tlkv:products-changed` | Yes (intentional full reload) |
| `tlkv:gold-table-changed` (TV/admin gold) | No product images |

---

## Image Findings

### Cache strategy

| Bucket | Upload cacheControl | URL pattern |
|--------|---------------------|-------------|
| `news-media` | `31536000` | UUID paths via API |
| `product-media` (before) | `3600` | `product-{ts}-{rand}.ext` |
| `product-media` (after) | `31536000` | `{uuid}.ext` under `products/{id}/thumbnail/` |

**Expected response headers** (new uploads):

```http
Cache-Control: public, max-age=31536000, immutable
```

**Note:** Existing product objects in storage retain old headers until re-uploaded or bucket metadata updated via Supabase dashboard/API.

### Rendering

- `product-card-layout.js` — `loading="lazy"`, `decoding="async"`, fixed aspect ratio (CLS-safe).
- `product-card.js` — prefers `thumbnailUrl`.
- No `srcset` / multi-size variants yet.

### Repeated downloads (evidence chain)

```
SSE gold-rows-updated (every ~3–30s)
  → vang-tich-luy renderBrandView()
    → renderProductGrid() [innerHTML destroy]
      → createProductCard() → new <img src="...supabase...">
        → browser request (revalidate if max-age=3600 expired)
```

After fix:

```
SSE gold-rows-updated
  → applyDerivedPricesToAllSections()
  → patchProductPricesInDom()  // text nodes only
```

---

## Evidence

### Component analysis (vanilla JS, not React)

No React Profiler applicable. DOM-based analysis:

| Component | SSE behavior | Image remount |
|-----------|--------------|---------------|
| `featured-products-section.js` | Price patch | Avoided |
| `vang-tich-luy-page.js` | Was full rebuild | **Fixed** |
| `product-card-layout.js` | N/A | Lazy + async decode |
| `catalog-admin.js` | Full table on `products-changed` | Admin-only traffic |

### Network request patterns

| Scenario | API calls (before) | API calls (after) |
|----------|-------------------|-------------------|
| Homepage featured load | 1 + N brands | 2 |
| Vang tich luy load | 1 + N brands | 2 |
| Gold SSE tick | 0 API + M image revalidations | 0 API + 0 images |

### Request flow (product save)

```
Admin form submit
  → saveProduct(item)
    → products.upsert
    → syncProductThumbnailRecord (product_images)
    → tlkv:products-changed
```

---

## Fixes Applied (code)

### 1. `js/admin-app.js`
- `cacheControl: '31536000'`
- UUID-based immutable filenames
- Hidden `pf-image-path` for storage path sync

### 2. `js/products-data.js`
- `pickThumbnailUrlFromRow`, `pathFromProductPublicUrl`
- `syncProductThumbnailRecord()` on save
- `thumbnailUrl` / `imageStoragePath` in `normalizeItem` / `productDbToApp`

### 3. `js/admin/product-form-admin.js`
- `imageStoragePath` in `readFormData()`

### 4. `js/admin/catalog-admin.js`
- Admin thumbs: `thumbnailUrl || image`, lazy + async

### 5. `js/products/catalog-api.js`
- Batched `fetchFeaturedBrandsWithProducts`
- Batched `fetchAccumulationByBrands`
- Added `brand_id` to featured product select

### 6. `js/products/featured-products-section.js`
- `buildSignature` includes `thumbnailUrl`

### 7. `js/products/vang-tich-luy-page.js`
- `patchProductPricesInDom()` — SSE no longer rebuilds grid
- `data-tlkv-product-id` on cards

---

## Recommended Improvements (prioritized)

### Critical

| Item | Impact | Complexity | Est. savings |
|------|--------|------------|--------------|
| Re-upload or batch-update Cache-Control on existing `product-media` objects | High CDN hit ratio | Medium (script/dashboard) | 40–60% egress on legacy images |
| Server-side product upload API (Sharp → WebP, like news) | Smaller payloads | Medium | 50–70% per image bytes |

### High

| Item | Impact | Complexity | Est. savings |
|------|--------|------------|--------------|
| Responsive variants (`thumb.webp`, `medium.webp`, `large.webp`) | Right-size per surface | High | 60–80% on list/table views |
| Delete storage objects on product hard-delete | Orphan cleanup | Low | Storage cost |
| Migrate admin Supabase init to shared env helper | Security + consistency | Low | — |

### Medium

| Item | Impact | Complexity | Est. savings |
|------|--------|------------|--------------|
| `srcset` on product cards | Bandwidth on retina | Medium | 20–40% |
| Block AI crawlers in `robots.txt` (GPTBot, etc.) | Bot egress | Low | Variable |
| `Disallow` Supabase storage URLs in robots (if hotlinking observed) | Bot egress | Low | Variable |

### Low

| Item | Impact | Complexity | Est. savings |
|------|--------|------------|--------------|
| Cloudflare R2 + CDN in front of storage | Edge cache control | High (ops) | Long-term cost |
| Service worker cache for product thumbs | Repeat visit speed | Medium | 10–20% return visits |

---

## Traffic & Cost Estimates

**Assumptions:**

- Avg product image: ~250 KB (raw upload, no WebP)
- Images per homepage: ~35 (featured carousel)
- Images per vang-tich-luy tab: ~15
- Gold SSE interval: ~15s average
- Session length: 5 min
- Daily visitors: 500
- Tabs with SSE open: 30% of product pages

### Before (worst case: vang-tich-luy + short cache)

Per SSE tick: 15 images × 250 KB = **3.75 MB** (if cache miss/revalidate)  
Ticks per 5 min session: 20 → **75 MB/session** from images alone on one tab.

### After (DOM patch + 1y cache)

Per SSE tick: **0 MB** images  
Initial page load: 15 × 250 KB = **3.75 MB** once (CDN cached for subsequent users).

### Monthly order-of-magnitude

| Metric | Before (est.) | After (est.) |
|--------|---------------|--------------|
| Egress per 500 DAU (product images) | 50–150 GB | 8–25 GB |
| Cache hit ratio (new uploads) | ~40% | ~90%+ |

*Validate against Supabase Dashboard → Storage → Egress / Cache Egress after deploy.*

---

## Bot Traffic

`robots.txt` allows all crawlers on `/`. Product images are served from public Supabase URLs embedded in HTML — **Googlebot/Bingbot will index and fetch them**. No GPTBot block present.

**Recommendations:**

```
User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /
```

Monitor Supabase logs for bot User-Agents on storage paths if egress remains high after frontend fixes.

---

## Supabase Metrics Correlation

| Metric | Likely driver |
|--------|---------------|
| **Cache Egress** ↑ | Short `max-age=3600` + SSE image remounts |
| **Egress** (non-cache) | First-time visitors, large originals |
| **Storage** | Orphaned files on re-upload (old paths not deleted) |

After deploy, expect **Cache Egress slope to flatten** while Storage may grow slowly until orphan cleanup.

---

## Architecture: Current vs Alternative

**Current:** Browser → Supabase Storage CDN (`getPublicUrl`)

**Alternative:** Browser → Cloudflare CDN → R2 (or Supabase origin)

Benefits: edge transforms, custom cache keys, bot firewall, signed URLs for hotlink protection.

Cost: migration effort, dual-write period, image transform service.

**Recommendation:** Complete in-repo fixes first; evaluate R2 if egress exceeds Pro quota after 2–4 weeks of metrics.

---

## Verification Checklist

- [ ] Deploy updated static JS + restart Node server
- [ ] Upload new product image → verify `Cache-Control: public, max-age=31536000`
- [ ] Save product → confirm `product_images` row with `role=thumbnail`
- [ ] Open vang-tich-luy → Network tab: gold SSE ticks do not repeat image requests
- [ ] Supabase Dashboard: compare Cache Egress week-over-week
- [ ] Optional: run `curl -I` on sample product-media URL

---

## Files Changed (this optimization pass)

- `js/admin-app.js`
- `js/products-data.js`
- `js/admin/product-form-admin.js`
- `js/admin/catalog-admin.js`
- `js/products/catalog-api.js`
- `js/products/featured-products-section.js`
- `js/products/vang-tich-luy-page.js`

---

*Report generated from codebase audit per `Technical_Review_Cache_Egress_Investigation.md`.*
