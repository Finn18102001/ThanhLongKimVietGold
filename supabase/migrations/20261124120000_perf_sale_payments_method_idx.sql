-- PERF-011 (Phase 2): index for invoice payment-method prefilter.
-- Evidence (2026-11-24): EXPLAIN ANALYZE
--   Seq Scan on pos_sale_payments Filter payment_method = 'CASH'
--   Execution Time ~135ms on ~4k rows.
-- Rollback: drop index if exists public.pos_sale_payments_method_sale_idx;
--           drop index if exists public.pos_sale_payments_transfer_account_sale_idx;
-- No table GRANT change (index only; §32.1 N/A).

create index if not exists pos_sale_payments_method_sale_idx
  on public.pos_sale_payments (payment_method, sale_id);

create index if not exists pos_sale_payments_transfer_account_sale_idx
  on public.pos_sale_payments (receive_account_kind, sale_id)
  where payment_method = 'TRANSFER';
