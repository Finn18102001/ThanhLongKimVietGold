-- P10-03 hotfix: khi KL sau nấu làm tăng total, nếu intended = old total (trả đủ) → bump intended = new total.
-- Tránh lỗi «Phải có ngày hẹn trả khi chưa trả đủ» trên Đồng ý sau nấu (BUY-000511).

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'tlkv_backup_20261110') then
    create table if not exists tlkv_backup_20261110._routines_p10_ux_20261122 (
      proname text,
      args text,
      definition text,
      saved_at timestamptz default now()
    );
  end if;
exception when others then
  raise notice 'snapshot skip: %', sqlerrm;
end $$;

create or replace function public.pos_set_buy_melt_weights(
  p_buy_id uuid,
  p_items jsonb,
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
  v_row record;
  v_total bigint := 0;
  v_gold bigint;
  v_line bigint;
  v_item public.pos_buy_items%rowtype;
  v_old_total bigint;
  v_old_intended bigint;
  v_new_intended bigint;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'set_buy_melt_weights');
  if v_cached is not null then return v_cached; end if;

  begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Danh sách khối lượng sau nấu trống' using errcode = '22023';
    end if;

    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status not in ('MELTING', 'WEIGHT_ENTERED') then
      raise exception 'Chỉ nhập KL sau nấu khi đang nấu / đã nhập KL' using errcode = 'P0001';
    end if;

    v_old_total := v_buy.total_dong;
    v_old_intended := v_buy.intended_paid_dong;

    for v_row in
      select * from jsonb_to_recordset(p_items) as x(
        item_id uuid,
        weight_after_chi numeric
      )
    loop
      if v_row.item_id is null then
        raise exception 'item_id bắt buộc' using errcode = '22023';
      end if;
      if v_row.weight_after_chi is null or v_row.weight_after_chi <= 0 then
        raise exception 'Khối lượng sau nấu phải > 0' using errcode = '22023';
      end if;

      select * into v_item from public.pos_buy_items where id = v_row.item_id and buy_id = v_buy.id for update;
      if not found then
        raise exception 'Dòng hàng không thuộc giao dịch' using errcode = 'P0001';
      end if;

      v_gold := (v_item.unit_price_dong::numeric * v_row.weight_after_chi * v_item.quantity)::bigint;
      v_line := v_gold + coalesce(v_item.stone_price_dong, 0) * v_item.quantity;
      update public.pos_buy_items
      set weight_after_chi = v_row.weight_after_chi,
          weight_chi = v_row.weight_after_chi,
          gold_amount_dong = v_gold,
          total_price_dong = v_line
      where id = v_item.id;

      if v_item.is_market_gold and v_item.sku_id is not null then
        update public.pos_skus
        set weight_chi = v_row.weight_after_chi
        where id = v_item.sku_id and is_market_gold;
      end if;
    end loop;

    select coalesce(sum(total_price_dong), 0) into v_total
    from public.pos_buy_items where buy_id = v_buy.id;

    -- Full-pay intent (intended == old total or null): bump with total. Partial: keep capped.
    if v_old_intended is null or v_old_intended = v_old_total then
      v_new_intended := v_total;
    else
      v_new_intended := least(v_old_intended, v_total);
    end if;

    update public.pos_buys
    set total_dong = v_total,
        remaining_dong = v_total - paid_dong,
        intended_paid_dong = v_new_intended,
        workflow_status = 'WEIGHT_ENTERED'
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (v_actor, 'BUY_MELT_WEIGHT', 'buy', v_buy.id, 'Nhập KL sau nấu ' || v_buy.buy_no,
      jsonb_build_object('total_dong', v_total, 'intended_paid_dong', v_new_intended));

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true, 'buyId', v_buy.id, 'totalDong', v_total, 'workflowStatus', 'WEIGHT_ENTERED'
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_set_buy_melt_weights(uuid, jsonb, text) from public;
grant execute on function public.pos_set_buy_melt_weights(uuid, jsonb, text) to authenticated, service_role;

create or replace function public.pos_confirm_buy_melt(
  p_buy_id uuid,
  p_agree boolean,
  p_idempotency_key text,
  p_payment_method text default null,
  p_paid_dong bigint default null,
  p_due_date date default null
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
  v_paid bigint;
  v_remaining bigint;
  v_due date;
  v_method text;
  v_total bigint;
  v_old_total bigint;
  v_old_intended bigint;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'confirm_buy_melt');
  if v_cached is not null then return v_cached; end if;

  begin
    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status not in ('AWAITING_CONFIRM', 'WEIGHT_ENTERED') then
      raise exception 'Chưa tới bước xác nhận khách' using errcode = 'P0001';
    end if;

    if not coalesce(p_agree, false) then
      update public.pos_buys
      set status = 'CANCELLED', workflow_status = 'CANCELLED'
      where id = v_buy.id;

      insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
      values (v_actor, 'BUY_MELT_CANCEL', 'buy', v_buy.id,
        'Khách không đồng ý — hủy ' || v_buy.buy_no, '{}'::jsonb);

      return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
        'ok', true, 'buyId', v_buy.id, 'status', 'CANCELLED', 'workflowStatus', 'CANCELLED'
      ));
    end if;

    if exists (
      select 1 from public.pos_buy_items
      where buy_id = v_buy.id and (weight_after_chi is null or weight_after_chi <= 0)
    ) then
      raise exception 'Thiếu khối lượng sau nấu trên một hoặc nhiều dòng' using errcode = '22023';
    end if;

    if not coalesce(v_buy.skip_melt, false) then
      if not exists (
        select 1 from public.pos_buy_attachments a
        where a.buy_id = v_buy.id and a.doc_kind = 'PURITY_TEST'
      ) then
        raise exception 'Bắt buộc upload Phiếu kiểm tra hàm lượng trước khi đồng ý' using errcode = '22023';
      end if;
    end if;

    v_old_total := v_buy.total_dong;
    v_old_intended := v_buy.intended_paid_dong;

    select coalesce(sum(total_price_dong), 0) into v_total
    from public.pos_buy_items where buy_id = v_buy.id;

    if v_total <> v_buy.total_dong then
      update public.pos_buys
      set total_dong = v_total,
          remaining_dong = v_total - paid_dong,
          intended_paid_dong = case
            when v_old_intended is null or v_old_intended = v_old_total then v_total
            else least(coalesce(v_old_intended, v_total), v_total)
          end
      where id = v_buy.id
      returning * into v_buy;
    elsif v_old_intended is not null
      and v_old_intended < v_buy.total_dong
      and v_old_intended > 0
      and p_paid_dong is null
      and p_due_date is null
      and v_buy.due_date is null
    then
      -- Stuck after prior melt bump bug: intended was full at intake then total grew.
      -- If no explicit partial pay / due date on this call, treat as full pay.
      if exists (
        select 1 from public.pos_audit_log a
        where a.entity_id = v_buy.id and a.action = 'BUY_MELT_WEIGHT'
      ) then
        update public.pos_buys
        set intended_paid_dong = total_dong
        where id = v_buy.id
        returning * into v_buy;
      end if;
    end if;

    v_method := coalesce(nullif(trim(p_payment_method), ''), v_buy.payment_method);
    if v_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;

    if p_paid_dong is not null then
      v_paid := p_paid_dong;
    else
      v_paid := coalesce(v_buy.intended_paid_dong, v_buy.total_dong);
    end if;

    if v_paid < 0 or v_paid > v_buy.total_dong then
      raise exception 'Số tiền đã trả không hợp lệ' using errcode = '22023';
    end if;
    v_remaining := v_buy.total_dong - v_paid;
    v_due := case when v_remaining = 0 then null else coalesce(p_due_date, v_buy.due_date) end;
    if v_remaining > 0 and v_due is null then
      raise exception 'Phải có ngày hẹn trả khi chưa trả đủ' using errcode = '22023';
    end if;

    update public.pos_buys
    set
      workflow_status = 'INVOICE_ISSUED',
      payment_method = v_method,
      intended_paid_dong = v_paid,
      remaining_dong = v_buy.total_dong - paid_dong,
      due_date = v_due
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_INVOICE_ISSUED', 'buy', v_buy.id,
      'Khách đồng ý — tạo hóa đơn mua ' || v_buy.buy_no,
      jsonb_build_object(
        'buy_no', v_buy.buy_no,
        'intended_paid_dong', v_paid,
        'payment_method', v_method,
        'skip_melt', coalesce(v_buy.skip_melt, false)
      )
    );

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true,
      'buyId', v_buy.id,
      'buyNo', v_buy.buy_no,
      'status', 'PROCESSING',
      'workflowStatus', 'INVOICE_ISSUED',
      'intendedPaidDong', v_paid
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_confirm_buy_melt(uuid, boolean, text, text, bigint, date) from public;
grant execute on function public.pos_confirm_buy_melt(uuid, boolean, text, text, bigint, date) to authenticated, service_role;

-- One-shot unlock stuck melt test (full-pay intent after KL bump)
update public.pos_buys
set intended_paid_dong = total_dong,
    remaining_dong = total_dong - paid_dong
where buy_no = 'BUY-000511'
  and status = 'PROCESSING'
  and workflow_status = 'AWAITING_CONFIRM'
  and due_date is null
  and coalesce(intended_paid_dong, 0) > 0
  and coalesce(intended_paid_dong, 0) < total_dong;
