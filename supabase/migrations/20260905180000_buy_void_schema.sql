-- Buy VOID schema (compensating). Mirrors sale void: keep history, no hard delete.

alter table public.pos_buys drop constraint if exists pos_buys_status_check;
alter table public.pos_buys
  add constraint pos_buys_status_check
  check (status in ('COMPLETED', 'FAILED', 'VOIDED'));

alter table public.pos_buys
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by text null,
  add column if not exists void_reason text null;

alter table public.pos_inventory_transactions drop constraint if exists pos_inventory_tx_type_check;
alter table public.pos_inventory_transactions
  add constraint pos_inventory_tx_type_check
  check (type in (
    'PURCHASE_RECEIVED',
    'SALE',
    'CUSTOMER_RETURN',
    'SUPPLIER_RETURN',
    'STOCK_ADJUSTMENT_IN',
    'STOCK_ADJUSTMENT_OUT',
    'PREORDER_FULFILL',
    'SALE_VOID',
    'PURCHASE_VOID'
  ));

alter table public.pos_cash_ledger drop constraint if exists pos_cash_ledger_txn_type_check;
alter table public.pos_cash_ledger
  add constraint pos_cash_ledger_txn_type_check
  check (txn_type in (
    'SALE_PAYMENT',
    'PURCHASE_PAYMENT',
    'RECEIVABLE_COLLECTION',
    'PAYABLE_PAYMENT',
    'OTHER_INCOME',
    'OTHER_EXPENSE',
    'TRANSFER',
    'SALE_VOID_REFUND',
    'PURCHASE_VOID_RECLAIM'
  ));
