-- Phase B (SRS customer/invoice notes): expose document note on pos_list_documents.
-- Reuse pos_sales.note / pos_buys.note / pos_purchase_receipts.note — no new status column.
-- Snapshot → tlkv_backup_20261110. §32.1: no CREATE TABLE for Data API (function replace only).

do $$
begin
  create schema if not exists tlkv_backup_20261110;

  create table if not exists tlkv_backup_20261110._routines_invoice_note_list (
    saved_at timestamptz not null default now(),
    schema_name text not null,
    proname text not null,
    identity_args text not null,
    definition text not null,
    primary key (schema_name, proname, identity_args, saved_at)
  );

  insert into tlkv_backup_20261110._routines_invoice_note_list (
    schema_name, proname, identity_args, definition
  )
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'pos_list_documents';
end $$;

create or replace function public.pos_list_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_q_doc boolean := v_q is not null and v_q ~ '^[0-9a-z\-]+$' and v_q ~ '[0-9]';
  v_total int;
  v_items jsonb;
  v_actor text;
  v_admin boolean;
begin
  v_actor := pos_private.require_pos_user();
  v_admin := public.tlkv_can_admin_read();

  if p_document_type is not null and p_document_type not in (
    'SALE_TO_CUSTOMER', 'PURCHASE_FROM_CUSTOMER', 'STOCK_RECEIPT'
  ) then
    raise exception 'Loai chung tu khong hop le' using errcode = '22023';
  end if;
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOIDED'
  ) then
    raise exception 'Trang thai thanh toan khong hop le' using errcode = '22023';
  end if;

  with docs as (
    select
      i.id,
      i.invoice_no as document_no,
      'SALE_TO_CUSTOMER'::text as document_type,
      i.issued_at,
      c.name as party_name,
      c.phone as party_phone,
      s.total_dong,
      s.paid_dong,
      s.remaining_dong,
      s.payment_status,
      s.payment_method,
      s.sale_no as ref_no,
      s.transaction_type::text as transaction_type,
      coalesce(
        s.fulfillment_status::text,
        case
          when s.transaction_type::text in ('PREORDER', 'DEPOSIT') then 'UNFULFILLED'
          else 'DELIVERED'
        end
      ) as fulfillment_status,
      (i.status = 'VOIDED' or i.voided_at is not null or s.status = 'VOIDED') as is_voided,
      s.note
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    join public.pos_customers c on c.id = i.customer_id
    where (
        (
          s.status = 'COMPLETED'
          and i.status is distinct from 'VOIDED'
          and i.voided_at is null
        )
        or i.status = 'VOIDED'
        or i.voided_at is not null
        or s.status = 'VOIDED'
      )
      and (v_admin or lower(trim(coalesce(i.actor_email, s.actor_email, ''))) = v_actor)
      and (p_document_type is null or p_document_type = 'SALE_TO_CUSTOMER')
      and (p_from is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (
        case
          when p_payment_status = 'VOIDED' then
            (i.status = 'VOIDED' or i.voided_at is not null or s.status = 'VOIDED')
          when p_payment_status is null then true
          else
            s.payment_status = p_payment_status
            and i.status is distinct from 'VOIDED'
            and i.voided_at is null
            and s.status is distinct from 'VOIDED'
        end
      )
      and (
        v_q is null
        or i.invoice_no ilike '%' || v_q || '%'
        or s.sale_no ilike '%' || v_q || '%'
        or c.phone ilike '%' || v_q || '%'
        or (not v_q_doc and c.name ilike '%' || v_q || '%')
      )

    union all

    select
      b.id,
      b.buy_no,
      'PURCHASE_FROM_CUSTOMER',
      coalesce(b.completed_at, b.created_at),
      coalesce(b.customer_name_snapshot, c.name),
      coalesce(b.customer_phone_snapshot, c.phone),
      b.total_dong,
      b.paid_dong,
      b.remaining_dong,
      b.payment_status,
      b.payment_method,
      b.buy_no,
      'SALE'::text,
      'DELIVERED'::text,
      (b.status = 'VOIDED' or b.voided_at is not null) as is_voided,
      b.note
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where (
        (
          b.status = 'COMPLETED'
          or (
            b.status = 'PROCESSING'
            and b.workflow_status in ('INVOICE_ISSUED', 'FORM02_READY')
          )
        )
        or b.status = 'VOIDED'
        or b.voided_at is not null
      )
      and (p_document_type is null or p_document_type = 'PURCHASE_FROM_CUSTOMER')
      and (p_from is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (
        case
          when p_payment_status = 'VOIDED' then
            (b.status = 'VOIDED' or b.voided_at is not null)
          when p_payment_status is null then true
          else
            b.payment_status = p_payment_status
            and b.status is distinct from 'VOIDED'
            and b.voided_at is null
        end
      )
      and (
        v_q is null
        or b.buy_no ilike '%' || v_q || '%'
        or coalesce(b.customer_phone_snapshot, c.phone) ilike '%' || v_q || '%'
        or (
          not v_q_doc
          and coalesce(b.customer_name_snapshot, c.name) ilike '%' || v_q || '%'
        )
      )

    union all

    select
      r.id,
      r.receipt_no,
      'STOCK_RECEIPT',
      coalesce(r.completed_at, r.received_at, r.created_at),
      r.supplier_name,
      null::text,
      r.total_dong,
      r.paid_dong,
      r.remaining_dong,
      r.payment_status,
      r.payment_method,
      r.receipt_no,
      'SALE'::text,
      'DELIVERED'::text,
      (
        r.document_status = 'CANCELLED'
        or coalesce(r.status, '') = 'CANCELLED'
        or r.voided_at is not null
      ) as is_voided,
      r.note
    from public.pos_purchase_receipts r
    where (
        r.document_status = 'COMPLETED'
        or r.document_status = 'CANCELLED'
        or r.voided_at is not null
      )
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (
        case
          when p_payment_status = 'VOIDED' then
            (
              r.document_status = 'CANCELLED'
              or coalesce(r.status, '') = 'CANCELLED'
              or r.voided_at is not null
            )
          when p_payment_status is null then true
          else
            r.payment_status = p_payment_status
            and r.document_status is distinct from 'CANCELLED'
            and coalesce(r.status, '') is distinct from 'CANCELLED'
            and r.voided_at is null
        end
      )
      and (
        v_q is null
        or r.receipt_no ilike '%' || v_q || '%'
        or (not v_q_doc and r.supplier_name ilike '%' || v_q || '%')
      )
  ),
  counted as (
    select count(*)::int as total from docs
  ),
  paged as (
    select
      d.id,
      d.document_no as "documentNo",
      d.document_type as "documentType",
      d.issued_at as "issuedAt",
      d.party_name as "partyName",
      d.party_phone as "partyPhone",
      d.total_dong as "totalDong",
      d.paid_dong as "paidDong",
      d.remaining_dong as "remainingDong",
      d.payment_status as "paymentStatus",
      d.payment_method as "paymentMethod",
      d.ref_no as "refNo",
      d.transaction_type as "transactionType",
      d.fulfillment_status as "fulfillmentStatus",
      d.is_voided as "isVoided",
      nullif(trim(coalesce(d.note, '')), '') as "note"
    from docs d
    order by d.issued_at desc
    limit v_limit offset v_offset
  )
  select
    (select total from counted),
    coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb)
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;

revoke all on function public.pos_list_documents(text, text, date, date, text, integer, integer)
  from public, anon;
grant execute on function public.pos_list_documents(text, text, date, date, text, integer, integer)
  to authenticated;
