-- Disagree cancel must not force remaining_dong = 0 while unpaid
-- (violates pos_buys_remaining_eq: remaining = total - paid).

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
  v_item record;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date;
  v_method text;
  v_form02 text;
  v_cost_piece bigint;
  v_brand text;
  v_total bigint;
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
      raise exception 'Cần nhập khối lượng sau nấu trước khi xác nhận' using errcode = 'P0001';
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

    select coalesce(sum(total_price_dong), 0) into v_total
    from public.pos_buy_items where buy_id = v_buy.id;

    if v_total <> v_buy.total_dong then
      update public.pos_buys
      set total_dong = v_total,
          remaining_dong = v_total - paid_dong,
          intended_paid_dong = least(coalesce(intended_paid_dong, v_total), v_total)
      where id = v_buy.id
      returning * into v_buy;
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
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_buy.total_dong, v_due);

    v_form02 := coalesce(
      v_buy.form02_no,
      'BK' || to_char((now() at time zone 'Asia/Ho_Chi_Minh'), 'YYYYMMDD')
        || '-' || lpad(nextval('public.pos_buy_doc_seq')::text, 3, '0')
    );

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
      insert into public.pos_buy_payments (
        buy_id, amount_dong, payment_method, paid_at, actor_email, note
      ) values (
        v_buy.id, v_paid, v_method, now(), v_actor, 'Thanh toán khi xác nhận mua sau nấu'
      );
    end if;

    update public.pos_buys
    set
      status = 'COMPLETED',
      workflow_status = 'COMPLETED',
      payment_method = v_method,
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due,
      form02_no = v_form02,
      completed_at = now()
    where id = v_buy.id;

    perform pos_private.upsert_payable_for_buy(v_buy.id);

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_COMPLETE', 'buy', v_buy.id,
      'Hoàn tất mua vào sau nấu ' || v_buy.buy_no,
      jsonb_build_object(
        'buy_no', v_buy.buy_no,
        'form02_no', v_form02,
        'total_dong', v_buy.total_dong,
        'paid_dong', v_paid
      )
    );

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true,
      'buyId', v_buy.id,
      'buyNo', v_buy.buy_no,
      'status', 'COMPLETED',
      'workflowStatus', 'COMPLETED',
      'form02No', v_form02,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;
