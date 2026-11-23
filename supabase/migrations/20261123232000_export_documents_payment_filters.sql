-- Phase E: pos_export_documents cùng filter p_payment_method + p_receive_account_kind
-- như pos_list_documents (EXISTS độc lập cấp HĐ — AND giữa hai filter).
-- Contract: docs/SYSTEM_DEVELOPMENT_RULES.md §32 / §32.1; backup 00-BACKUP-ROLLBACK §3.

do $snap$
begin
  create table if not exists tlkv_backup_20261110._routines_export_payment_filters (
    schema_name text not null,
    proname text not null,
    identity_args text not null,
    definition text not null,
    snapped_at timestamptz not null default now(),
    primary key (schema_name, proname, identity_args, snapped_at)
  );
  insert into tlkv_backup_20261110._routines_export_payment_filters (
    schema_name, proname, identity_args, definition
  )
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'pos_export_documents';
end
$snap$;

do $patch$
declare
  def text;
  sale_anchor text;
  buy_anchor text;
  receipt_anchor text;
  sale_filters text;
  buy_filters text;
  receipt_filters text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'pos_export_documents'
  limit 1;

  if def is null then
    raise exception 'pos_export_documents not found';
  end if;

  if position('p_receive_account_kind' in def) > 0 then
    raise notice 'pos_export_documents already has kind filter — skip';
    return;
  end if;

  def := replace(
    def,
    'CREATE OR REPLACE FUNCTION public.pos_export_documents(p_document_type text DEFAULT NULL::text, p_payment_status text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50)',
    'CREATE OR REPLACE FUNCTION public.pos_export_documents(p_document_type text DEFAULT NULL::text, p_payment_status text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_payment_method text DEFAULT NULL::text, p_receive_account_kind text DEFAULT NULL::text)'
  );

  def := replace(
    def,
    $d$
  v_doc_limit int := case
    when p_limit is null or p_limit <= 0 then 5000
    else least(greatest(p_limit, 1), 2000)
  end;
  v_result jsonb;
$d$,
    $d$
  v_doc_limit int := case
    when p_limit is null or p_limit <= 0 then 5000
    else least(greatest(p_limit, 1), 2000)
  end;
  v_result jsonb;
  v_method text := nullif(upper(trim(coalesce(p_payment_method, ''))), '');
  v_kind text := nullif(upper(trim(coalesce(p_receive_account_kind, ''))), '');
$d$
  );

  def := replace(
    def,
    $d$
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOIDED'
  ) then
    raise exception 'Trang thai thanh toan khong hop le' using errcode = '22023';
  end if;

  with docs as (
$d$,
    $d$
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOIDED'
  ) then
    raise exception 'Trang thai thanh toan khong hop le' using errcode = '22023';
  end if;
  if v_method is not null and v_method not in ('CASH', 'TRANSFER') then
    raise exception 'Phuong thuc thanh toan khong hop le' using errcode = '22023';
  end if;
  if v_kind is not null and v_kind not in ('COMPANY', 'PERSONAL') then
    raise exception 'Loai tai khoan khong hop le' using errcode = '22023';
  end if;

  with docs as (
$d$
  );

  sale_anchor := $a$
      and (
        v_q is null
        or i.invoice_no ilike '%' || v_q || '%'
        or s.sale_no ilike '%' || v_q || '%'
        or c.phone ilike '%' || v_q || '%'
        or (not v_q_doc and c.name ilike '%' || v_q || '%')
      )

    union all
$a$;

  sale_filters := $a$
      and (
        v_q is null
        or i.invoice_no ilike '%' || v_q || '%'
        or s.sale_no ilike '%' || v_q || '%'
        or c.phone ilike '%' || v_q || '%'
        or (not v_q_doc and c.name ilike '%' || v_q || '%')
      )
      and (
        v_method is null
        or exists (
          select 1 from public.pos_sale_payments sp
          where sp.sale_id = s.id and sp.payment_method = v_method
        )
        or (
          not exists (select 1 from public.pos_sale_payments sp where sp.sale_id = s.id)
          and (s.payment_method = v_method or s.payment_method = 'MIXED')
        )
        or exists (
          select 1 from public.pos_employee_cash_requests y
          where y.source_type = 'sale' and y.source_id = s.id
            and y.payment_method = v_method
            and y.status is distinct from 'REJECTED'
        )
      )
      and (
        v_kind is null
        or exists (
          select 1 from public.pos_sale_payments sp
          where sp.sale_id = s.id
            and sp.payment_method = 'TRANSFER'
            and sp.receive_account_kind = v_kind
        )
        or exists (
          select 1 from public.pos_employee_cash_requests y
          where y.source_type = 'sale' and y.source_id = s.id
            and y.payment_method = 'TRANSFER'
            and y.receive_account_kind = v_kind
            and y.status is distinct from 'REJECTED'
        )
      )

    union all
$a$;

  if position(sale_anchor in def) = 0 then
    raise exception 'export patch failed: sale v_q anchor not found';
  end if;
  def := replace(def, sale_anchor, sale_filters);

  buy_anchor := $a$
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
$a$;

  buy_filters := $a$
      and (
        v_q is null
        or b.buy_no ilike '%' || v_q || '%'
        or coalesce(b.customer_phone_snapshot, c.phone) ilike '%' || v_q || '%'
        or (
          not v_q_doc
          and coalesce(b.customer_name_snapshot, c.name) ilike '%' || v_q || '%'
        )
      )
      and (
        v_method is null
        or exists (
          select 1 from public.pos_buy_payments bp
          where bp.buy_id = b.id and bp.payment_method = v_method
        )
        or (
          not exists (select 1 from public.pos_buy_payments bp where bp.buy_id = b.id)
          and (
            b.payment_method = v_method
            or b.payment_method = 'MIXED'
            or (
              b.status = 'PROCESSING'
              and (b.payment_method = v_method or b.payment_method = 'MIXED')
            )
          )
        )
        or exists (
          select 1 from public.pos_employee_cash_requests y
          where y.source_type = 'buy' and y.source_id = b.id
            and y.payment_method = v_method
            and y.status is distinct from 'REJECTED'
        )
      )
      and (
        v_kind is null
        or exists (
          select 1 from public.pos_buy_payments bp
          where bp.buy_id = b.id
            and bp.payment_method = 'TRANSFER'
            and bp.receive_account_kind = v_kind
        )
        or (
          not exists (select 1 from public.pos_buy_payments bp where bp.buy_id = b.id)
          and b.payment_method = 'TRANSFER'
          and b.receive_account_kind = v_kind
        )
        or exists (
          select 1 from public.pos_employee_cash_requests y
          where y.source_type = 'buy' and y.source_id = b.id
            and y.payment_method = 'TRANSFER'
            and y.receive_account_kind = v_kind
            and y.status is distinct from 'REJECTED'
        )
      )

    union all
$a$;

  if position(buy_anchor in def) = 0 then
    raise exception 'export patch failed: buy v_q anchor not found';
  end if;
  def := replace(def, buy_anchor, buy_filters);

  receipt_anchor := $a$
      and (
        v_q is null
        or r.receipt_no ilike '%' || v_q || '%'
        or (not v_q_doc and r.supplier_name ilike '%' || v_q || '%')
      )
  ),
$a$;

  receipt_filters := $a$
      and (
        v_q is null
        or r.receipt_no ilike '%' || v_q || '%'
        or (not v_q_doc and r.supplier_name ilike '%' || v_q || '%')
      )
      and (v_method is null or r.payment_method = v_method or r.payment_method = 'MIXED')
      and (v_kind is null)
  ),
$a$;

  if position(receipt_anchor in def) = 0 then
    raise exception 'export patch failed: receipt v_q anchor not found';
  end if;
  def := replace(def, receipt_anchor, receipt_filters);

  if position('p_receive_account_kind text DEFAULT NULL' in def) = 0 then
    raise exception 'export patch failed: signature not updated';
  end if;

  execute def;

  -- Remove pre-filter overload so PostgREST cannot pick the unfiltered 6-arg form.
  drop function if exists public.pos_export_documents(text, text, date, date, text, integer);

  revoke all on function public.pos_export_documents(text, text, date, date, text, integer, text, text)
    from public, anon;
  grant execute on function public.pos_export_documents(text, text, date, date, text, integer, text, text)
    to authenticated, service_role;
end
$patch$;
