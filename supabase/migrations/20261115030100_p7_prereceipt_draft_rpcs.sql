-- P7: RPCs create/print/list pending drafts. Receive-from-draft RPC in follow-up migration.
-- Doc: docs/pos-big-update/P7-00-PRERECEIPT-LABELING.md

create or replace function public.pos_create_label_draft(
  p_payload jsonb,
  p_test_marker text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_mode text;
  v_type text;
  v_product text;
  v_name text;
  v_brand text;
  v_category text;
  v_n bigint;
  v_serial text;
  v_msp text;
  v_code text;
  v_id uuid;
  v_snap jsonb;
  v_cost bigint;
  v_sell bigint;
  v_labor bigint;
begin
  if v_actor = '' then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;

  v_mode := upper(trim(coalesce(p_payload ->> 'code_mode', '')));
  if v_mode not in ('AUTO_MSP', 'PRE_ASSIGNED') then
    raise exception 'code_mode phải là AUTO_MSP hoặc PRE_ASSIGNED' using errcode = '22023';
  end if;

  v_name := trim(coalesce(p_payload ->> 'product_name', ''));
  if v_name = '' then
    raise exception 'Tên sản phẩm không được trống' using errcode = '22023';
  end if;

  v_brand := trim(coalesce(p_payload ->> 'brand_text', ''));
  v_category := trim(coalesce(p_payload ->> 'category_text', ''));

  v_type := upper(trim(coalesce(p_payload ->> 'type_code', '')));
  v_type := regexp_replace(v_type, '\s+', '', 'g');
  v_type := regexp_replace(v_type, '-+$', '');

  if v_mode = 'AUTO_MSP' then
    if v_type ~ '\s' or v_type ~ '-' then
      raise exception 'Mã loại không hợp lệ' using errcode = '22023';
    end if;
    if length(v_type) > 24 then
      raise exception 'Mã loại tối đa 24 ký tự' using errcode = '22023';
    end if;
    -- 1A: reserve serial now
    v_n := nextval('public.pos_label_msp_seq');
    v_serial := lpad(v_n::text, 6, '0');
    if v_type = '' then
      v_msp := v_serial;
    else
      v_msp := v_type || '-' || v_serial;
    end if;
    v_code := v_msp;
    v_product := null;
  else
    v_product := upper(trim(coalesce(p_payload ->> 'product_number', '')));
    v_product := regexp_replace(v_product, '\s+', '', 'g');
    if v_type = '' or v_product = '' then
      raise exception 'Mã có sẵn cần type_code và product_number' using errcode = '22023';
    end if;
    if v_type !~ '^[A-Z0-9]+$' or v_product !~ '^[A-Z0-9]+$' then
      raise exception 'Mã có sẵn chỉ gồm chữ và số' using errcode = '22023';
    end if;
    v_msp := null;
    v_serial := null;
    v_code := v_type || v_product;
  end if;

  v_cost := nullif(p_payload ->> 'cost_price_dong', '')::bigint;
  v_sell := nullif(p_payload ->> 'sell_price_dong', '')::bigint;
  v_labor := nullif(p_payload ->> 'labor_fee_dong', '')::bigint;
  if v_cost is not null and v_cost < 0 then
    raise exception 'Giá nhập không hợp lệ' using errcode = '22023';
  end if;
  if v_sell is not null and v_sell < 0 then
    raise exception 'Giá bán không hợp lệ' using errcode = '22023';
  end if;

  v_snap := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'reserved_msp', v_msp,
    'reserved_serial_no', v_serial,
    'printable_code', v_code,
    'created_by', v_actor,
    'created_at_server', now()
  );

  insert into public.pos_label_drafts (
    code_mode, type_code, product_number, reserved_serial_no, reserved_msp, printable_code,
    product_name, brand_text, category_text, product_type_text, price_row_id, price_note,
    cost_price_dong, sell_price_dong, labor_fee_dong, weight_chi, gold_age_text,
    stone_weight_chi, stone_quantity, stone_unit_price_dong, note,
    status, snapshot_json, test_marker, created_by
  ) values (
    v_mode, v_type, v_product, v_serial, v_msp, v_code,
    v_name, v_brand, v_category,
    nullif(trim(coalesce(p_payload ->> 'product_type_text', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'price_row_id', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'price_note', '')), ''),
    v_cost, v_sell, v_labor,
    nullif(p_payload ->> 'weight_chi', '')::numeric,
    nullif(trim(coalesce(p_payload ->> 'gold_age_text', '')), ''),
    nullif(p_payload ->> 'stone_weight_chi', '')::numeric,
    nullif(p_payload ->> 'stone_quantity', '')::integer,
    nullif(p_payload ->> 'stone_unit_price_dong', '')::bigint,
    nullif(trim(coalesce(p_payload ->> 'note', '')), ''),
    'DRAFT', v_snap, nullif(trim(coalesce(p_test_marker, '')), ''), v_actor
  )
  returning id into v_id;

  insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'LABEL_DRAFT_CREATE', 'pos_label_draft', v_id,
    'Tạo draft tem trước nhập kho',
    jsonb_build_object('code_mode', v_mode, 'printable_code', v_code, 'test_marker', p_test_marker)
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'code_mode', v_mode,
    'printable_code', v_code,
    'reserved_msp', v_msp,
    'reserved_serial_no', v_serial,
    'status', 'DRAFT'
  );
end;
$function$;

revoke all on function public.pos_create_label_draft(jsonb, text) from public, anon;
grant execute on function public.pos_create_label_draft(jsonb, text) to authenticated;
grant execute on function public.pos_create_label_draft(jsonb, text) to service_role;

create or replace function public.pos_record_label_draft_print(
  p_draft_id uuid,
  p_print_qty integer default 1,
  p_stock_size text default '90x14',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_draft public.pos_label_drafts%rowtype;
  v_action text;
  v_log_id uuid;
begin
  if v_actor = '' then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;
  if p_print_qty is null or p_print_qty <= 0 then
    raise exception 'Số lượng in không hợp lệ' using errcode = '22023';
  end if;

  select * into v_draft from public.pos_label_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Draft không tồn tại' using errcode = 'P0001';
  end if;
  if v_draft.status = 'CANCELLED' then
    raise exception 'Draft đã hủy' using errcode = 'P0001';
  end if;
  if v_draft.status = 'RECEIVED' then
    raise exception 'Draft đã nhập kho — chỉ in lại từ lịch sử piece nếu có' using errcode = 'P0001';
  end if;

  if v_draft.print_count = 0 then
    v_action := 'FIRST_PRINT';
  else
    v_action := 'REPRINT';
  end if;

  insert into public.pos_label_draft_print_log (
    draft_id, actor_email, action_type, print_qty, stock_size, printable_code, payload_json
  ) values (
    v_draft.id, v_actor, v_action, p_print_qty, coalesce(nullif(trim(p_stock_size), ''), '90x14'),
    v_draft.printable_code, coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_log_id;

  update public.pos_label_drafts
  set status = 'PRINTED',
      printed_at = coalesce(printed_at, now()),
      print_count = print_count + 1,
      updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object(
    'ok', true,
    'log_id', v_log_id,
    'draft_id', v_draft.id,
    'action_type', v_action,
    'printable_code', v_draft.printable_code,
    'status', 'PRINTED'
  );
end;
$function$;

revoke all on function public.pos_record_label_draft_print(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.pos_record_label_draft_print(uuid, integer, text, jsonb) to authenticated;
grant execute on function public.pos_record_label_draft_print(uuid, integer, text, jsonb) to service_role;

create or replace function public.pos_list_pending_label_drafts(
  p_query text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text := lower(trim(coalesce(public.tlkv_current_email(), '')));
  v_q text := lower(trim(coalesce(p_query, '')));
  v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows jsonb;
begin
  if v_actor = '' then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.printed_at desc nulls last, x.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      d.id,
      d.code_mode,
      d.printable_code,
      d.product_name,
      d.brand_text,
      d.category_text,
      d.cost_price_dong,
      d.sell_price_dong,
      d.weight_chi,
      d.status,
      d.printed_at,
      d.created_at,
      d.created_by,
      d.test_marker
    from public.pos_label_drafts d
    where d.status = 'PRINTED'
      and (
        v_q = ''
        or lower(d.printable_code) like '%' || v_q || '%'
        or lower(d.product_name) like '%' || v_q || '%'
        or lower(d.brand_text) like '%' || v_q || '%'
      )
    order by d.printed_at desc nulls last, d.created_at desc
    limit v_lim
  ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$function$;

revoke all on function public.pos_list_pending_label_drafts(text, integer) from public, anon;
grant execute on function public.pos_list_pending_label_drafts(text, integer) to authenticated;
grant execute on function public.pos_list_pending_label_drafts(text, integer) to service_role;
