/**
 * Request-scoped performance spans (Phase 2 PERF-015).
 * Log-only; never changes business results. Enable with TLKV_PERF_LOG=1
 * or automatically in NODE_ENV=development.
 */
import { cache } from "react";

type PerfBucket = {
  spans: Array<{ name: string; ms: number; ok: boolean }>;
};

const getPerfBucket = cache((): PerfBucket => ({ spans: [] }));

function perfLogEnabled(): boolean {
  if (process.env.TLKV_PERF_LOG === "1") return true;
  if (process.env.TLKV_PERF_LOG === "0") return false;
  return process.env.NODE_ENV === "development";
}

/** Run `fn` and record wall time under `name` for this RSC/request. */
export async function withPerfSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  let ok = true;
  try {
    return await fn();
  } catch (err) {
    ok = false;
    throw err;
  } finally {
    const ms = Math.round(performance.now() - t0);
    if (perfLogEnabled()) {
      const bucket = getPerfBucket();
      bucket.spans.push({ name, ms, ok });
      const status = ok ? "ok" : "err";
      console.info(`[tlkv-perf] ${name} ${ms}ms ${status}`);
    }
  }
}

/** Snapshot of spans recorded so far in this request (for tests / page footers). */
export function getPerfSpans(): ReadonlyArray<{ name: string; ms: number; ok: boolean }> {
  return getPerfBucket().spans.slice();
}
