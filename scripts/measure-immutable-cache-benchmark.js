#!/usr/bin/env node
"use strict";

/**
 * Print immutable cache mock benchmark + DevTools measurement checklist.
 * Run: node scripts/measure-immutable-cache-benchmark.js
 */

const { benchmarkImmutableVsLegacy } = require("../lib/immutable-cache");

const bench = benchmarkImmutableVsLegacy({
  imageCount: 7,
  visitsPerUser: 3,
  revisitIntervalSec: 4000,
});

console.log("=== Immutable cache mock benchmark (before vs after) ===\n");
console.log("Scenario: homepage featured section, 7 thumbnails, 3 revisits/user");
console.log("");
console.log("BEFORE (legacy max-age=3600):");
console.log("  network requests / user:", bench.before.networkRequestsPerUser);
console.log("  total network requests:", bench.before.totalNetworkRequests);
console.log("");
console.log("AFTER (immutable max-age=31536000):");
console.log("  network requests / user:", bench.after.networkRequestsPerUser);
console.log("  total network requests:", bench.after.totalNetworkRequests);
console.log("");
console.log("Saved requests:", bench.savedRequests, "(" + bench.savedPercent + "%)");
console.log("");
console.log("=== Chrome DevTools protocol ===");
bench.devtoolsProtocol.forEach(function (step, idx) {
  console.log(step);
});
console.log("");
console.log("Optional: backfill legacy Supabase objects");
console.log("  SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-storage-immutable-cache.js --dry-run");
