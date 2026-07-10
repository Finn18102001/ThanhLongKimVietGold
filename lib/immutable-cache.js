"use strict";

/** One-year immutable cache for versioned/hashed public assets (Supabase Storage + /assets). */
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Short TTL for HTML/dynamic boot scripts that must refresh on deploy. */
const NO_STORE_CACHE_CONTROL = "no-store, no-cache, must-revalidate";

/** Legacy product upload TTL before immutable migration. */
const LEGACY_PRODUCT_CACHE_MAX_AGE_SEC = 3600;

/**
 * Supabase Storage upload options: never overwrite + immutable headers.
 * @param {string} contentType
 */
function immutableStorageUploadOptions(contentType) {
  return {
    contentType: contentType,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    upsert: false,
  };
}

function parseMaxAgeSec(cacheControl) {
  const m = String(cacheControl || "").match(/max-age=(\d+)/i);
  return m ? Number(m[1]) : 0;
}

function isImmutableCacheControl(cacheControl) {
  const s = String(cacheControl || "");
  return /max-age=31536000/i.test(s) && /immutable/i.test(s);
}

/**
 * Mock browser image request model for before/after benchmarks (unit tests + DevTools protocol).
 * - legacy: short TTL → revisits within TTL window still revalidate (network)
 * - immutable: after first 200, disk cache serves with zero network until URL changes
 *
 * @param {{ cacheControl: string, visits: number, revisitIntervalSec?: number }} opts
 * @returns {{ networkRequests: number, cacheHits: number, policy: string }}
 */
function simulateImageVisitCycle(opts) {
  const cacheControl = String((opts && opts.cacheControl) || "");
  const visits = Math.max(1, Number((opts && opts.visits) || 1));
  const revisitIntervalSec = Number((opts && opts.revisitIntervalSec) || 300);
  const maxAge = parseMaxAgeSec(cacheControl);
  const immutable = isImmutableCacheControl(cacheControl);

  let networkRequests = 0;
  let cacheHits = 0;
  let cachedAtSec = null;

  for (let i = 0; i < visits; i += 1) {
    const nowSec = i * revisitIntervalSec;
    if (cachedAtSec == null) {
      networkRequests += 1;
      cachedAtSec = nowSec;
      continue;
    }
    if (immutable) {
      cacheHits += 1;
      continue;
    }
    const ageSec = nowSec - cachedAtSec;
    if (maxAge > 0 && ageSec < maxAge) {
      cacheHits += 1;
      continue;
    }
    networkRequests += 1;
    cachedAtSec = nowSec;
  }

  return {
    networkRequests: networkRequests,
    cacheHits: cacheHits,
    policy: immutable ? "immutable" : "legacy",
  };
}

/**
 * Compare legacy vs immutable request counts (used in tests / DevTools checklist).
 * @param {{ imageCount: number, visitsPerUser: number, revisitIntervalSec?: number }} opts
 */
function benchmarkImmutableVsLegacy(opts) {
  const imageCount = Math.max(1, Number((opts && opts.imageCount) || 7));
  const visitsPerUser = Math.max(2, Number((opts && opts.visitsPerUser) || 3));
  const revisitIntervalSec = Number((opts && opts.revisitIntervalSec) || 300);

  const legacy = simulateImageVisitCycle({
    cacheControl: "public, max-age=" + LEGACY_PRODUCT_CACHE_MAX_AGE_SEC,
    visits: visitsPerUser,
    revisitIntervalSec: revisitIntervalSec,
  });
  const immutable = simulateImageVisitCycle({
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    visits: visitsPerUser,
    revisitIntervalSec: revisitIntervalSec,
  });

  const legacyTotal = legacy.networkRequests * imageCount;
  const immutableTotal = immutable.networkRequests * imageCount;
  const savedRequests = legacyTotal - immutableTotal;
  const savedPercent = legacyTotal > 0 ? Math.round((savedRequests / legacyTotal) * 100) : 0;

  return {
    imageCount: imageCount,
    visitsPerUser: visitsPerUser,
    revisitIntervalSec: revisitIntervalSec,
    before: {
      cacheControl: "public, max-age=" + LEGACY_PRODUCT_CACHE_MAX_AGE_SEC,
      networkRequestsPerUser: legacy.networkRequests,
      totalNetworkRequests: legacyTotal,
    },
    after: {
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      networkRequestsPerUser: immutable.networkRequests,
      totalNetworkRequests: immutableTotal,
    },
    savedRequests: savedRequests,
    savedPercent: savedPercent,
    devtoolsProtocol: [
      "1. Open DevTools → Network, enable Disable cache OFF",
      "2. Hard reload homepage (first visit) → note storage image count (Status 200)",
      "3. Soft reload same page 2× without clearing cache → immutable expects 0 new storage GET",
      "4. Filter: /storage/v1/object/public/product-media/",
      "5. Compare Size column: (disk cache) or (memory cache) on revisit = success",
    ],
  };
}

module.exports = {
  IMMUTABLE_CACHE_CONTROL,
  NO_STORE_CACHE_CONTROL,
  LEGACY_PRODUCT_CACHE_MAX_AGE_SEC,
  immutableStorageUploadOptions,
  isImmutableCacheControl,
  parseMaxAgeSec,
  simulateImageVisitCycle,
  benchmarkImmutableVsLegacy,
};
