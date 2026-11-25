"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/shared/lib/use-debounced-value";
import { findSkuIdsByMspQuery } from "./msp-search";

/**
 * PERF-009 — MSP typeahead with debounce + race/cancel + immediate clear.
 * Search semantics unchanged: RPC only when trimmed query length ≥ 2.
 */
export function useMspSkuIdSearch(query: string, delayMs = 300): string[] {
  const [mspSkuIds, setMspSkuIds] = useState<string[]>([]);
  const debouncedQuery = useDebouncedValue(query, delayMs);

  // Clear stale hits immediately when live query drops below 2 (do not wait debounce).
  useEffect(() => {
    if (query.trim().length < 2) {
      setMspSkuIds([]);
    }
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setMspSkuIds([]);
      return;
    }
    void findSkuIdsByMspQuery(q)
      .then((ids) => {
        if (!cancelled) setMspSkuIds(ids);
      })
      .catch(() => {
        if (!cancelled) setMspSkuIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  return mspSkuIds;
}
