-- Phase E: Flag ON — validate + persist receive_account_* trên YC (không ghi pos_sale_payments
-- để tránh void hoàn tiền kép). List filter OR thêm EXISTS trên cash_requests.
-- Contract: §32.1 GRANT; backup 00-BACKUP-ROLLBACK §3.

do $snap$
begin
  create table if not exists tlkv_backup_20261110._routines_fund_receive_account (
    schema_name text not null,
    proname text not null,
    identity_args text not null,
    definition text not null,
    snapped_at timestamptz not null default now(),
    primary key (schema_name, proname, identity_args, snapped_at)
  );
  insert into tlkv_backup_20261110._routines_fund_receive_account (
    schema_name, proname, identity_args, definition
  )
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('pos_private', 'employee_cash_request_create'),
    ('pos_private', 'complete_sale'),
    ('pos_private', 'collect_sale_payment'),
    ('pos_private', 'collect_buy_payment'),
    ('public', 'pos_list_documents')
  );
end
$snap$;

-- ---------------------------------------------------------------------------
-- 1) Columns on cash requests (+ §32.1 GRANT unchanged — ALTER only)
-- ---------------------------------------------------------------------------
alter table public.pos_employee_cash_requests
  add column if not exists receive_account_kind text,
  add column if not exists receive_account_note text;

do $ck$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_employee_cash_requests_receive_account_kind_check'
  ) then
    alter table public.pos_employee_cash_requests
      add constraint pos_employee_cash_requests_receive_account_kind_check
      check (
        receive_account_kind is null
        or receive_account_kind in ('COMPANY', 'PERSONAL')
      );
  end if;
end
$ck$;

-- Table already exposed; keep privileges (no new table). Authenticated already has DML via prior grants.
-- Confirm grants exist for authenticated + service_role (idempotent).
do $g$
begin
  grant select, insert, update, delete on public.pos_employee_cash_requests to authenticated;
  grant select, insert, update, delete on public.pos_employee_cash_requests to service_role;
exception when others then
  raise notice 'cash_requests grant refresh: %', sqlerrm;
end
$g$;

-- ---------------------------------------------------------------------------
-- 2) employee_cash_request_create — optional account params (drop+recreate)
-- ---------------------------------------------------------------------------
drop function if exists pos_private.employee_cash_request_create(
  text, bigint, text, text, text, uuid, text, uuid, text, text, uuid, text, uuid, text, jsonb, text
);

create or replace function pos_private.employee_cash_request_create(
  p_kind text,
  p_amount_dong bigint,
  p_payment_method text,
  p_content text,
  p_source_type text,
  p_source_id uuid,
  p_source_code text,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_cccd text default null,
  p_related_staff_id uuid default null,
  p_related_staff_name text default null,
  p_related_gold_account_id uuid default null,
  p_note text default null,
  p_lines jsonb default '[]'::jsonb,
  p_actor_email text default null,
  p_receive_account_kind text default null,
  p_receive_account_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kind text := upper(trim(coalesce(p_kind, '')));
  v_method text := upper(trim(coalesce(p_payment_method, 'CASH')));
  v_source text := lower(trim(coalesce(p_source_type, '')));
  v_actor text := coalesce(nullif(trim(coalesce(p_actor_email, '')), ''), public.tlkv_current_email());
  v_code text;
  v_id uuid;
  v_content text;
  v_acc_kind text;
  v_acc_note text;
begin
  if v_kind not in ('THU', 'CHI') then raise exception 'EMP_CASH_YC_KIND_INVALID'; end if;
  if p_amount_dong is null or p_amount_dong <= 0 then raise exception 'EMP_CASH_YC_AMOUNT_INVALID'; end if;
  if v_source not in ('sale', 'buy') then raise exception 'EMP_CASH_YC_SOURCE_INVALID'; end if;
  if p_source_id is null then raise exception 'EMP_CASH_YC_SOURCE_REQUIRED'; end if;
  if v_method not in ('CASH', 'TRANSFER', 'CARD', 'MIXED') then
    v_method := 'CASH';
  end if;

  select m.kind, m.note into v_acc_kind, v_acc_note
  from pos_private.normalize_receive_account(
    v_method, p_receive_account_kind, p_receive_account_note, true
  ) as m;

  v_content := nullif(trim(coalesce(p_content, '')), '');
  if v_content is null then
    v_content := case when v_kind = 'THU' then 'Yêu cầu thu tiền từ hóa đơn' else 'Yêu cầu chi tiền theo phiếu mua' end;
  end if;

  select id, code into v_id, v_code
  from public.pos_employee_cash_requests
  where source_type = v_source
    and source_id = p_source_id
    and amount_dong = p_amount_dong
    and payment_method = v_method
    and status = 'PENDING'
  limit 1;
  if v_id is not null then
    update public.pos_employee_cash_requests
    set receive_account_kind = coalesce(receive_account_kind, v_acc_kind),
        receive_account_note = coalesce(receive_account_note, v_acc_note),
        updated_at = now()
    where id = v_id
      and (receive_account_kind is null or receive_account_note is null);
    return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'alreadyExists', true);
  end if;

  v_code := pos_private.employee_cash_request_next_code(v_kind);
  insert into public.pos_employee_cash_requests (
    code, kind, status, amount_dong, payment_method, content, note,
    source_type, source_id, source_code,
    customer_id, customer_name, customer_cccd,
    related_gold_account_id, related_staff_id, related_staff_name,
    requested_by_email, lines_json,
    receive_account_kind, receive_account_note
  ) values (
    v_code, v_kind, 'PENDING', p_amount_dong, v_method, v_content,
    nullif(trim(coalesce(p_note, '')), ''),
    v_source, p_source_id, nullif(trim(coalesce(p_source_code, '')), ''),
    p_customer_id, nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_cccd, '')), ''),
    p_related_gold_account_id, p_related_staff_id,
    nullif(trim(coalesce(p_related_staff_name, '')), ''),
    v_actor, coalesce(p_lines, '[]'::jsonb),
    v_acc_kind, v_acc_note
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'code', v_code, 'alreadyExists', false,
    'receive_account_kind', v_acc_kind, 'receive_account_note', v_acc_note
  );
end;
$$;

revoke all on function pos_private.employee_cash_request_create(
  text, bigint, text, text, text, uuid, text, uuid, text, text, uuid, text, uuid, text, jsonb, text, text, text
) from public;
grant execute on function pos_private.employee_cash_request_create(
  text, bigint, text, text, text, uuid, text, uuid, text, text, uuid, text, uuid, text, jsonb, text, text, text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) complete_sale Flag ON split loop — pass kind/note into YC create
--    (normalize runs inside employee_cash_request_create)
-- ---------------------------------------------------------------------------
do $cs$
declare
  def text;
  old_call text;
  new_call text;
  old_nonsplit text;
  new_nonsplit text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pos_private' and p.proname = 'complete_sale'
    and pg_get_function_identity_arguments(p.oid) like '%p_payment_splits%'
  limit 1;

  if def is null then
    raise exception 'complete_sale (splits) not found';
  end if;

  -- Split path: append kind/note args to YC create (unique by v_split.method)
  old_call := $o$
            v_yc := pos_private.employee_cash_request_create(
              'THU', v_split.amount_dong, v_split.method,
              'Thu tiền hóa đơn ' || v_invoice_no,
              'sale', v_sale_id, v_invoice_no,
              v_customer_id, v_cust_name, v_cust_cccd,
              v_operator, v_staff_name, v_related_gold,
              v_yc_note, v_yc_lines, v_actor
            );
$o$;
  new_call := $n$
            v_yc := pos_private.employee_cash_request_create(
              'THU', v_split.amount_dong, v_split.method,
              'Thu tiền hóa đơn ' || v_invoice_no,
              'sale', v_sale_id, v_invoice_no,
              v_customer_id, v_cust_name, v_cust_cccd,
              v_operator, v_staff_name, v_related_gold,
              v_yc_note, v_yc_lines, v_actor,
              v_split.receive_account_kind, v_split.receive_account_note
            );
$n$;

  if position(old_call in def) = 0 then
    raise exception 'complete_sale fund split YC call not found';
  end if;
  def := replace(def, old_call, new_call);

  -- Non-split Flag ON: TRANSFER without splits must still be rejected by normalize
  -- inside create (kind null). Pass nulls explicitly.
  old_nonsplit := $o$
          v_yc := pos_private.employee_cash_request_create(
            'THU', v_paid, p_payment_method,
            'Thu tiền hóa đơn ' || v_invoice_no,
            'sale', v_sale_id, v_invoice_no,
            v_customer_id, v_cust_name, v_cust_cccd,
            v_operator, v_staff_name, v_related_gold,
            v_yc_note, v_yc_lines, v_actor
          );
$o$;
  new_nonsplit := $n$
          v_yc := pos_private.employee_cash_request_create(
            'THU', v_paid, p_payment_method,
            'Thu tiền hóa đơn ' || v_invoice_no,
            'sale', v_sale_id, v_invoice_no,
            v_customer_id, v_cust_name, v_cust_cccd,
            v_operator, v_staff_name, v_related_gold,
            v_yc_note, v_yc_lines, v_actor,
            null::text, null::text
          );
$n$;

  if position(old_nonsplit in def) > 0 then
    def := replace(def, old_nonsplit, new_nonsplit);
  end if;

  execute def;
end
$cs$;

-- ---------------------------------------------------------------------------
-- 4) collect_sale_payment Flag ON — pass kind into YC (already normalized)
-- ---------------------------------------------------------------------------
do $col$
declare
  def text;
  old_yc text;
  new_yc text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pos_private' and p.proname = 'collect_sale_payment'
    and pg_get_function_identity_arguments(p.oid) like '%p_receive_account_kind%'
  limit 1;

  if def is null then
    raise exception 'collect_sale_payment with receive_account not found';
  end if;

  old_yc := $o$
      v_yc := pos_private.employee_cash_request_create(
        'THU', p_amount_dong, p_payment_method,
        'Thu tiền hóa đơn ' || coalesce(v_inv_no, v_sale.sale_no),
        'sale', p_sale_id, coalesce(v_inv_no, v_sale.sale_no),
        v_sale.customer_id, v_cust_name, v_cust_cccd,
        v_receiver, v_staff_name, v_related_gold,
        v_note, v_yc_lines, v_actor
      );
$o$;
  new_yc := $n$
      v_yc := pos_private.employee_cash_request_create(
        'THU', p_amount_dong, p_payment_method,
        'Thu tiền hóa đơn ' || coalesce(v_inv_no, v_sale.sale_no),
        'sale', p_sale_id, coalesce(v_inv_no, v_sale.sale_no),
        v_sale.customer_id, v_cust_name, v_cust_cccd,
        v_receiver, v_staff_name, v_related_gold,
        v_note, v_yc_lines, v_actor,
        v_acc_kind, v_acc_note
      );
$n$;

  if position(old_yc in def) = 0 then
    raise exception 'collect_sale_payment fund YC call not found';
  end if;
  def := replace(def, old_yc, new_yc);
  execute def;
end
$col$;

-- ---------------------------------------------------------------------------
-- 5) collect_buy_payment Flag ON — pass kind into YC if present
-- ---------------------------------------------------------------------------
do $buy$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pos_private' and p.proname = 'collect_buy_payment'
    and pg_get_function_identity_arguments(p.oid) like '%p_receive_account_kind%'
  limit 1;

  if def is null then
    raise notice 'collect_buy_payment skip';
    return;
  end if;

  -- Best-effort: if classic 16-arg create call exists inside fund branch, append args.
  if position(
    'v_yc := pos_private.employee_cash_request_create(' in def
  ) = 0 then
    raise notice 'collect_buy_payment: no YC create — skip';
    return;
  end if;

  -- Only patch if still ending with v_actor) without kind args after a CHI/THU create.
  if position('receive_account_kind, receive_account_note' in def) > 0
     and position('v_acc_kind, v_acc_note' in def) > 0 then
    -- may already pass elsewhere; try specific replace for CHI create ending with v_actor
    null;
  end if;

  def := regexp_replace(
    def,
    $re$v_yc := pos_private\.employee_cash_request_create\(\s*'CHI',\s*p_amount_dong,\s*p_payment_method,\s*'Chi tiền phiếu mua ' \|\| coalesce\(v_buy\.buy_no,\s*''\),\s*'buy',\s*p_buy_id,\s*v_buy\.buy_no,\s*v_buy\.customer_id,\s*v_cust_name,\s*v_cust_cccd,\s*v_receiver,\s*v_staff_name,\s*v_related_gold,\s*v_note,\s*v_yc_lines,\s*v_actor\s*\);$re$,
    $re$v_yc := pos_private.employee_cash_request_create(
        'CHI', p_amount_dong, p_payment_method,
        'Chi tiền phiếu mua ' || coalesce(v_buy.buy_no, ''),
        'buy', p_buy_id, v_buy.buy_no,
        v_buy.customer_id, v_cust_name, v_cust_cccd,
        v_receiver, v_staff_name, v_related_gold,
        v_note, v_yc_lines, v_actor,
        v_acc_kind, v_acc_note
      );$re$,
    'n'
  );

  execute def;
exception when others then
  raise notice 'collect_buy_payment YC patch soft-fail: %', sqlerrm;
end
$buy$;

-- ---------------------------------------------------------------------------
-- 6) pos_list_documents — OR EXISTS trên YC cho method/kind (parity Flag ON)
-- ---------------------------------------------------------------------------
do $list$
declare
  def text;
  sale_method_old text;
  sale_method_new text;
  sale_kind_old text;
  sale_kind_new text;
  buy_method_old text;
  buy_method_new text;
  buy_kind_old text;
  buy_kind_new text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'pos_list_documents'
    and pg_get_function_identity_arguments(p.oid) like '%p_receive_account_kind%'
  limit 1;

  if def is null then
    raise exception 'pos_list_documents with kind filter not found';
  end if;

  if position('pos_employee_cash_requests y' in def) > 0 then
    raise notice 'list already has YC filter — skip';
    return;
  end if;

  sale_method_old := $o$
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
      )
$o$;
  sale_method_new := $n$
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
$n$;

  sale_kind_old := $o$
      and (
        v_kind is null
        or exists (
          select 1 from public.pos_sale_payments sp
          where sp.sale_id = s.id
            and sp.payment_method = 'TRANSFER'
            and sp.receive_account_kind = v_kind
        )
      )
$o$;
  sale_kind_new := $n$
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
$n$;

  if position(sale_method_old in def) = 0 or position(sale_kind_old in def) = 0 then
    raise exception 'list sale method/kind anchors not found';
  end if;
  def := replace(def, sale_method_old, sale_method_new);
  def := replace(def, sale_kind_old, sale_kind_new);

  buy_method_old := $o$
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
      )
$o$;
  buy_method_new := $n$
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
$n$;

  buy_kind_old := $o$
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
      )
$o$;
  buy_kind_new := $n$
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
$n$;

  if position(buy_method_old in def) = 0 or position(buy_kind_old in def) = 0 then
    raise exception 'list buy method/kind anchors not found';
  end if;
  def := replace(def, buy_method_old, buy_method_new);
  def := replace(def, buy_kind_old, buy_kind_new);

  execute def;
end
$list$;
