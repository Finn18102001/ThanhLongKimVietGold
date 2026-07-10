#!/usr/bin/env node
"use strict";

/**
 * One-time metadata migration: set immutable cache headers on existing Supabase Storage objects.
 *
 * Preconditions (immutable strategy):
 * - Does NOT change object paths or public URLs
 * - Re-uploads same bytes with upsert:true only to refresh Cache-Control metadata
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-storage-immutable-cache.js --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-storage-immutable-cache.js --apply
 *
 * Optional:
 *   --bucket=product-media   (repeatable; default: product-media, news-media)
 *   --prefix=products/     limit to folder prefix
 */

const { createClient } = require("@supabase/supabase-js");
const { supabasePublicEnv, trimEnv } = require("../lib/supabase-public-env");
const {
  IMMUTABLE_CACHE_CONTROL,
  isImmutableCacheControl,
} = require("../lib/immutable-cache");

const DEFAULT_BUCKETS = ["product-media", "news-media"];
const PAGE_SIZE = 100;

function parseArgs(argv) {
  const opts = {
    dryRun: true,
    buckets: [],
    prefix: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");
    if (arg === "--apply") opts.dryRun = false;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--bucket=")) opts.buckets.push(arg.slice("--bucket=".length));
    else if (arg.startsWith("--prefix=")) opts.prefix = arg.slice("--prefix=".length);
  }
  if (!opts.buckets.length) opts.buckets = DEFAULT_BUCKETS.slice();
  return opts;
}

function guessContentType(path) {
  const ext = String(path).split(".").pop().toLowerCase();
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
  };
  return map[ext] || "application/octet-stream";
}

async function listAllObjects(sb, bucket, prefix) {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix || "", {
      limit: PAGE_SIZE,
      offset: offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) break;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const name = row && row.name ? String(row.name) : "";
      if (!name) continue;
      const childPrefix = prefix ? prefix.replace(/\/?$/, "/") + name : name;
      if (row.id == null && !row.metadata) {
        const nested = await listAllObjects(sb, bucket, childPrefix);
        out.push.apply(out, nested);
        continue;
      }
      out.push(childPrefix);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

async function readObjectCacheControl(sb, bucket, objectPath) {
  const folder = objectPath.includes("/") ? objectPath.slice(0, objectPath.lastIndexOf("/")) : "";
  const name = objectPath.includes("/") ? objectPath.slice(objectPath.lastIndexOf("/") + 1) : objectPath;
  const { data, error } = await sb.storage.from(bucket).list(folder, {
    search: name,
    limit: 1,
  });
  if (error) return "";
  const row = (data || [])[0];
  const cc = row && row.metadata && row.metadata.cacheControl;
  return cc ? String(cc) : "";
}

async function backfillObject(sb, bucket, objectPath, dryRun) {
  const current = await readObjectCacheControl(sb, bucket, objectPath);
  if (isImmutableCacheControl(current)) {
    return { path: objectPath, status: "skipped", reason: "already-immutable" };
  }

  if (dryRun) {
    return {
      path: objectPath,
      status: "would-update",
      from: current || "(missing)",
      to: IMMUTABLE_CACHE_CONTROL,
    };
  }

  const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(objectPath);
  if (dlErr) {
    return { path: objectPath, status: "error", reason: dlErr.message || "download-failed" };
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const contentType = guessContentType(objectPath);
  const { error: upErr } = await sb.storage.from(bucket).upload(objectPath, buf, {
    contentType: contentType,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    upsert: true,
  });
  if (upErr) {
    return { path: objectPath, status: "error", reason: upErr.message || "upload-failed" };
  }
  return { path: objectPath, status: "updated", from: current || "(missing)" };
}

async function main() {
  const opts = parseArgs(process.argv);
  const { url } = supabasePublicEnv();
  const serviceKey = trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceKey) {
    console.error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    (opts.dryRun ? "[DRY RUN] " : "[APPLY] ") +
      "Immutable cache backfill — buckets: " +
      opts.buckets.join(", ")
  );

  const summary = { scanned: 0, updated: 0, skipped: 0, errors: 0, wouldUpdate: 0 };

  for (let b = 0; b < opts.buckets.length; b += 1) {
    const bucket = opts.buckets[b];
    const paths = await listAllObjects(sb, bucket, opts.prefix);
    console.log("Bucket", bucket + ":", paths.length, "objects");
    for (let i = 0; i < paths.length; i += 1) {
      const objectPath = paths[i];
      summary.scanned += 1;
      const result = await backfillObject(sb, bucket, objectPath, opts.dryRun);
      if (result.status === "skipped") summary.skipped += 1;
      else if (result.status === "updated") summary.updated += 1;
      else if (result.status === "would-update") summary.wouldUpdate += 1;
      else if (result.status === "error") summary.errors += 1;

      if (result.status !== "skipped") {
        console.log(JSON.stringify({ bucket: bucket, ...result }));
      }
    }
  }

  console.log("Summary:", JSON.stringify(summary, null, 2));
  if (opts.dryRun) {
    console.log("Re-run with --apply to write metadata.");
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
