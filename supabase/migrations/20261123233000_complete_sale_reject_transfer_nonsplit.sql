-- Phase E: Flag OFF non-split path must not create TRANSFER without account kind.
-- Client cũ gửi p_payment_method=TRANSFER mà không có payment_splits → reject rõ ràng.

do $snap$
begin
  create table if not exists tlkv_backup_20261110._routines_reject_transfer_nonsplit (
    schema_name text not null,
    proname text not null,
    identity_args text not null,
    definition text not null,
    snapped_at timestamptz not null default now(),
    primary key (schema_name, proname, identity_args, snapped_at)
  );
  insert into tlkv_backup_20261110._routines_reject_transfer_nonsplit (
    schema_name, proname, identity_args, definition
  )
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pos_private' and p.proname = 'complete_sale'
    and pg_get_function_identity_arguments(p.oid) like '%p_payment_splits%';
end
$snap$;

do $p$
declare
  def text;
  old text;
  new text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pos_private' and p.proname = 'complete_sale'
    and pg_get_function_identity_arguments(p.oid) like '%p_payment_splits%'
  limit 1;

  if position('Chuyển khoản phải chọn tài khoản công ty hoặc cá nhân (gửi payment_splits)' in def) > 0 then
    raise notice 'already patched — skip';
    return;
  end if;

  old := $o$
          insert into public.pos_sale_payments (
            sale_id, amount_dong, payment_method, paid_at, actor_email, note,
            idempotency_key, received_by_staff_id
          ) values (
            v_sale_id, v_paid, p_payment_method, now(), v_actor,
            case when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán' else 'Thanh toán lúc bán' end,
            'sale-open:' || trim(p_idempotency_key),
            v_operator
          );
$o$;

  new := $n$
          if p_payment_method = 'TRANSFER' then
            raise exception 'Chuyển khoản phải chọn tài khoản công ty hoặc cá nhân (gửi payment_splits)'
              using errcode = '22023';
          end if;
          insert into public.pos_sale_payments (
            sale_id, amount_dong, payment_method, paid_at, actor_email, note,
            idempotency_key, received_by_staff_id,
            receive_account_kind, receive_account_note
          ) values (
            v_sale_id, v_paid, p_payment_method, now(), v_actor,
            case when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán' else 'Thanh toán lúc bán' end,
            'sale-open:' || trim(p_idempotency_key),
            v_operator,
            null, null
          );
$n$;

  if position(old in def) = 0 then
    -- Already rewritten to include receive_account columns without reject — try that form
    old := $o2$
          insert into public.pos_sale_payments (
            sale_id, amount_dong, payment_method, paid_at, actor_email, note,
            idempotency_key, received_by_staff_id,
            receive_account_kind, receive_account_note
          ) values (
            v_sale_id, v_paid, p_payment_method, now(), v_actor,
            case when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán' else 'Thanh toán lúc bán' end,
            'sale-open:' || trim(p_idempotency_key),
            v_operator,
            null, null
          );
$o2$;
    if position(old in def) = 0 then
      raise exception 'non-split payment insert not found';
    end if;
    -- already has null kind cols; only inject reject before insert
    def := replace(
      def,
      old,
      $n2$
          if p_payment_method = 'TRANSFER' then
            raise exception 'Chuyển khoản phải chọn tài khoản công ty hoặc cá nhân (gửi payment_splits)'
              using errcode = '22023';
          end if;
$n2$ || old
    );
  else
    def := replace(def, old, new);
  end if;

  execute def;
end
$p$;
