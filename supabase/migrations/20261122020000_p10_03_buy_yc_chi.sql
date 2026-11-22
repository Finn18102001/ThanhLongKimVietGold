-- P10-03 / Module 4b: Flag ON → mua hoàn tất tạo YC-CHI PENDING, không INSERT pos_buy_payments (không đụng CASH-001).
-- Stock/inventory: giữ AS-IS nhận kho ngay khi complete (P10-01 D4). Chưa tách QV «xác nhận nhận vàng» 2 bước như bán.
-- Flag OFF = hành vi cũ.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'tlkv_backup_20261110') then
    create table if not exists tlkv_backup_20261110._routines_p10_03_buy (
      saved_at timestamptz not null default now(),
      schema_name text not null,
      proname text not null,
      identity_args text not null,
      definition text not null
    );
    insert into tlkv_backup_20261110._routines_p10_03_buy (schema_name, proname, identity_args, definition)
    select 'public', 'pos_complete_buy_melt', 'uuid, text',
           pg_get_functiondef('public.pos_complete_buy_melt(uuid,text)'::regprocedure);
    insert into tlkv_backup_20261110._routines_p10_03_buy (schema_name, proname, identity_args, definition)
    select 'pos_private', 'collect_buy_payment', 'uuid, bigint, text, text, text, date',
           pg_get_functiondef('pos_private.collect_buy_payment(uuid,bigint,text,text,text,date)'::regprocedure);
  end if;
exception when others then
  raise notice 'P10-03 buy snapshot skipped: %', sqlerrm;
end $$;

create or replace function public.pos_complete_buy_melt(
  p_buy_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_buy public.pos_buys%rowtype;
  v_item record;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_cost_piece bigint;
  v_brand text;
  v_fund_on boolean := false;
  v_fund_codes text[] := array[]::text[];
  v_cust_name text;
  v_cust_cccd text;
  v_staff_id uuid;
  v_staff_name text;
  v_related_gold uuid;
  v_yc_lines jsonb;
  v_yc jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_buy_melt');
  if v_cached is not null then return v_cached; end if;

  begin
    v_fund_on := pos_private.employee_fund_flag_on();

    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status <> 'FORM02_READY' then
      raise exception 'Chỉ hoàn tất khi đang ở bước Phiếu 02' using errcode = 'P0001';
    end if;
    if v_buy.form02_no is null then
      raise exception 'Thiếu số Phiếu 02' using errcode = 'P0001';
    end if;

    v_paid := coalesce(v_buy.intended_paid_dong, v_buy.total_dong);
    if v_paid < 0 or v_paid > v_buy.total_dong then
      raise exception 'Số tiền thanh toán dự kiến không hợp lệ' using errcode = '22023';
    end if;
    v_remaining := v_buy.total_dong - v_paid;
    if v_remaining > 0 and v_buy.due_date is null then
      raise exception 'Phải có ngày hẹn trả khi chưa trả đủ' using errcode = '22023';
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_buy.total_dong, v_buy.due_date);

    -- P10-01 D4: nhận kho AS-IS (kể cả Flag ON). QV confirm receive 2 bước = deferred.
    for v_item in
      select * from public.pos_buy_items where buy_id = v_buy.id
    loop
      v_cost_piece := (v_item.total_price_dong::numeric / greatest(v_item.quantity, 1))::bigint;
      v_brand := v_item.brand_name;
      perform pos_private.apply_stock_change(
        v_item.sku_id,
        v_item.quantity,
        'PURCHASE_RECEIVED',
        'Mua vào từ khách ' || v_buy.buy_no,
        'CUSTOMER_BUY',
        v_buy.id,
        v_actor,
        v_cost_piece,
        v_brand
      );
    end loop;

    if v_paid > 0 then
      if v_fund_on then
        v_cust_name := v_buy.customer_name_snapshot;
        v_cust_cccd := v_buy.customer_citizen_id_snapshot;
        if v_buy.customer_id is not null then
          select coalesce(c.name, v_cust_name), coalesce(c.citizen_id, v_cust_cccd)
            into v_cust_name, v_cust_cccd
          from public.pos_customers c where c.id = v_buy.customer_id;
        end if;

        if nullif(trim(coalesce(v_buy.actor_email, '')), '') is not null then
          select s.id, s.full_name into v_staff_id, v_staff_name
          from public.pos_staff s
          where lower(s.email) = lower(v_buy.actor_email) and s.is_active
          limit 1;
          if v_staff_id is not null then
            select a.id into v_related_gold
            from public.pos_employee_gold_accounts a
            where a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active
            limit 1;
          end if;
        end if;

        select coalesce(jsonb_agg(jsonb_build_object(
          'name', coalesce(bi.product_name_snapshot, 'Hàng mua'),
          'purity', bi.gold_age,
          'unit', 'chiếc',
          'weight', coalesce(bi.weight_after_chi, bi.weight_chi),
          'unitPriceDong', bi.unit_price_dong,
          'amountDong', bi.total_price_dong
        ) order by bi.id), '[]'::jsonb)
        into v_yc_lines
        from public.pos_buy_items bi
        where bi.buy_id = v_buy.id;

        v_yc := pos_private.employee_cash_request_create(
          'CHI',
          v_paid,
          coalesce(v_buy.payment_method, 'CASH'),
          'Chi tiền phiếu mua ' || coalesce(v_buy.buy_no, p_buy_id::text),
          'buy',
          v_buy.id,
          v_buy.buy_no,
          v_buy.customer_id,
          v_cust_name,
          v_cust_cccd,
          v_staff_id,
          v_staff_name,
          v_related_gold,
          'YC-CHI khi hoàn tất mua (Flag ON) — không ghi CASH-001',
          v_yc_lines,
          v_actor
        );
        if v_yc->>'code' is not null then
          v_fund_codes := array_append(v_fund_codes, v_yc->>'code');
        end if;
      else
        insert into public.pos_buy_payments (
          buy_id, amount_dong, payment_method, paid_at, actor_email, note
        ) values (
          v_buy.id, v_paid, v_buy.payment_method, now(), v_actor, 'Thanh toán khi hoàn tất mua sau nấu'
        );
      end if;
    end if;

    update public.pos_buys
    set
      status = 'COMPLETED',
      workflow_status = 'COMPLETED',
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      completed_at = now()
    where id = v_buy.id;

    perform pos_private.upsert_payable_for_buy(v_buy.id);

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_COMPLETE', 'buy', v_buy.id,
      'Hoàn tất mua vào sau nấu ' || v_buy.buy_no,
      jsonb_build_object(
        'buy_no', v_buy.buy_no,
        'form02_no', v_buy.form02_no,
        'total_dong', v_buy.total_dong,
        'paid_dong', v_paid,
        'employee_fund', v_fund_on,
        'fund_request_codes', to_jsonb(v_fund_codes)
      )
    );

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true,
      'buyId', v_buy.id,
      'buyNo', v_buy.buy_no,
      'status', 'COMPLETED',
      'workflowStatus', 'COMPLETED',
      'form02No', v_buy.form02_no,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status,
      'fundRequestCodes', case when coalesce(array_length(v_fund_codes, 1), 0) > 0 then to_jsonb(v_fund_codes) else '[]'::jsonb end
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_complete_buy_melt(uuid, text) from public;
grant execute on function public.pos_complete_buy_melt(uuid, text) to authenticated, service_role;

create or replace function pos_private.collect_buy_payment(
  p_buy_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor text;
  v_cached jsonb;
  v_key text;
  v_buy public.pos_buys%rowtype;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_fund_on boolean := false;
  v_fund_codes text[] := array[]::text[];
  v_cust_name text;
  v_cust_cccd text;
  v_staff_id uuid;
  v_staff_name text;
  v_related_gold uuid;
  v_yc_lines jsonb;
  v_yc jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_fund_on := pos_private.employee_fund_flag_on();
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'buy-collect:' || p_buy_id::text || ':' || gen_random_uuid()::text;
  end if;

  v_cached := pos_private.begin_idempotency(v_key, 'collect_buy_payment');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_amount_dong is null or p_amount_dong <= 0 then
      raise exception 'Số tiền trả phải > 0' using errcode = '22023';
    end if;

    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then
      raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001';
    end if;
    if v_buy.status <> 'COMPLETED' then
      raise exception 'Chỉ trả tiền trên phiếu mua đã hoàn tất' using errcode = 'P0001';
    end if;
    if v_buy.remaining_dong <= 0 then
      raise exception 'Phiếu mua đã trả đủ' using errcode = 'P0001';
    end if;
    if p_amount_dong > v_buy.remaining_dong then
      raise exception 'Số tiền trả vượt số còn nợ khách' using errcode = '22023';
    end if;

    v_paid := v_buy.paid_dong + p_amount_dong;
    v_remaining := v_buy.total_dong - v_paid;
    v_due := case when v_remaining = 0 then null else coalesce(p_due_date, v_buy.due_date) end;
    if v_remaining > 0 and v_due is null then
      raise exception 'Phải có ngày hẹn trả khi còn nợ khách' using errcode = '22023';
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_buy.total_dong, v_due);

    if v_fund_on then
      v_cust_name := v_buy.customer_name_snapshot;
      v_cust_cccd := v_buy.customer_citizen_id_snapshot;
      if v_buy.customer_id is not null then
        select coalesce(c.name, v_cust_name), coalesce(c.citizen_id, v_cust_cccd)
          into v_cust_name, v_cust_cccd
        from public.pos_customers c where c.id = v_buy.customer_id;
      end if;
      if nullif(trim(coalesce(v_buy.actor_email, '')), '') is not null then
        select s.id, s.full_name into v_staff_id, v_staff_name
        from public.pos_staff s
        where lower(s.email) = lower(v_buy.actor_email) and s.is_active
        limit 1;
        if v_staff_id is not null then
          select a.id into v_related_gold
          from public.pos_employee_gold_accounts a
          where a.kind = 'STAFF' and a.staff_id = v_staff_id and a.is_active
          limit 1;
        end if;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', coalesce(bi.product_name_snapshot, 'Hàng mua'),
        'purity', bi.gold_age,
        'unit', 'chiếc',
        'weight', coalesce(bi.weight_after_chi, bi.weight_chi),
        'unitPriceDong', bi.unit_price_dong,
        'amountDong', bi.total_price_dong
      ) order by bi.id), '[]'::jsonb)
      into v_yc_lines
      from public.pos_buy_items bi
      where bi.buy_id = p_buy_id;

      v_yc := pos_private.employee_cash_request_create(
        'CHI', p_amount_dong, p_payment_method,
        'Chi tiền phiếu mua ' || coalesce(v_buy.buy_no, p_buy_id::text),
        'buy', p_buy_id, v_buy.buy_no,
        v_buy.customer_id, v_cust_name, v_cust_cccd,
        v_staff_id, v_staff_name, v_related_gold,
        coalesce(v_note, 'YC-CHI trả thêm (Flag ON) — không ghi CASH-001'),
        v_yc_lines, v_actor
      );
      if v_yc->>'code' is not null then
        v_fund_codes := array_append(v_fund_codes, v_yc->>'code');
      end if;
    else
      insert into public.pos_buy_payments (
        buy_id, amount_dong, payment_method, paid_at, actor_email, note, idempotency_key
      ) values (
        p_buy_id, p_amount_dong, p_payment_method, now(), v_actor, v_note, v_key
      );
    end if;

    update public.pos_buys
    set
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due
    where id = p_buy_id;

    perform pos_private.upsert_payable_for_buy(p_buy_id);

    insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_PAYMENT_COLLECT', 'buy', p_buy_id,
      'Trả thêm cho khách trên ' || v_buy.buy_no,
      jsonb_build_object(
        'amount_dong', p_amount_dong,
        'remaining_dong', v_remaining,
        'employee_fund', v_fund_on,
        'fund_request_codes', to_jsonb(v_fund_codes)
      )
    );

    v_result := jsonb_build_object(
      'buyId', p_buy_id,
      'buyNo', v_buy.buy_no,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status,
      'dueDate', v_due,
      'fundRequestCodes', case when coalesce(array_length(v_fund_codes, 1), 0) > 0 then to_jsonb(v_fund_codes) else '[]'::jsonb end
    );
    return pos_private.finish_idempotency(v_key, v_result);
  exception
    when others then
      perform pos_private.clear_pending_idempotency(v_key);
      raise;
  end;
end;
$function$;
