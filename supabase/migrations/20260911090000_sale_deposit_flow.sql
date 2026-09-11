-- Sale deposit / partial-pay pickup flow.
-- FULL SALE (paid = total): unchanged — stock out immediately.
-- PARTIAL/UNPAID on in-stock cart: DEPOSIT — no stock until delivery receipt.
-- PREORDER (zero stock): unchanged.
-- Already applied remotely as 20260911090000; kept in repo for other environments.

alter table public.pos_sales
  drop constraint if exists pos_sales_transaction_type_check;

alter table public.pos_sales
  add constraint pos_sales_transaction_type_check
  check (transaction_type in ('SALE', 'PREORDER', 'DEPOSIT'));

alter table public.pos_sales
  add column if not exists deposit_agreement_no text,
  add column if not exists deposit_slip_no text,
  add column if not exists delivery_receipt_no text,
  add column if not exists deposit_delivery_place text,
  add column if not exists deposit_price_locked boolean not null default true,
  add column if not exists deposit_workflow_status text;

alter table public.pos_sales
  drop constraint if exists pos_sales_deposit_workflow_check;

alter table public.pos_sales
  add constraint pos_sales_deposit_workflow_check
  check (
    deposit_workflow_status is null
    or deposit_workflow_status in (
      'AWAITING_AGREEMENT',
      'AGREEMENT_CONFIRMED',
      'SLIP_ISSUED',
      'AWAITING_DELIVERY',
      'COMPLETED',
      'CANCELLED'
    )
  );

create sequence if not exists public.pos_deposit_sale_seq;
create sequence if not exists public.pos_deposit_agreement_seq;
create sequence if not exists public.pos_deposit_slip_seq;
create sequence if not exists public.pos_delivery_receipt_seq;
