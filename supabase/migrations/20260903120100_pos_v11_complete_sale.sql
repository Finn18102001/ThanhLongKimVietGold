-- POS v1.1 RPCs: operator, charges, ±300k/chỉ, preorder, BUG-001 complete_sale.

create or replace function pos_private.resolve_operator_staff_id(p_operator_staff_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := public.tlkv_current_email();
  v_self public.pos_staff%rowtype;
  v_op public.pos_staff%rowtype;
begin
  select * into v_self
  from public.pos_staff s
  where s.email = v_email
  limit 1;

  if v_self.id is not null and coalesce(v_self.is_shared, false) then
    if p_operator_staff_id is null then
      raise exception 'Tài khoản POS dùng chung phải chọn nhân viên thực hiện'
        using errcode = '22023';
    end if;
    select * into v_op
    from public.pos_staff s
    where s.id = p_operator_staff_id;
    if v_op.id is null or not v_op.is_active then
      raise exception 'Nhân viên thực hiện không hợp lệ' using errcode = 'P0002';
    end if;
    if coalesce(v_op.is_shared, false) then
      raise exception 'Không chọn tài khoản dùng chung làm nhân viên bán'
        using errcode = '22023';
    end if;
    return v_op.id;
  end if;

  if v_self.id is not null then
    return v_self.id;
  end if;

  if p_operator_staff_id is not null then
    select * into v_op from public.pos_staff s where s.id = p_operator_staff_id and s.is_active;
    if v_op.id is null or coalesce(v_op.is_shared, false) then
      raise exception 'Nhân viên thực hiện không hợp lệ' using errcode = 'P0002';
    end if;
    return v_op.id;
  end if;

  return null;
end;
$$;

create or replace function pos_private.staff_display_name(p_staff_id uuid, p_fallback text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.full_name from public.pos_staff s where s.id = p_staff_id),
    nullif(trim(coalesce(p_fallback, '')), ''),
    'Nhân viên'
  );
$$;

drop function if exists pos_private.complete_sale(text, text, text, text, jsonb, uuid, text);
drop function if exists pos_private.complete_sale(text, text, text, text, jsonb, uuid, text, bigint, date);

create or replace function pos_private.complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_charges jsonb default '[]'::jsonb,
  p_operator_staff_id uuid default null,
  p_pickup_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_customer_id uuid;
  v_sale_id uuid;
  v_sale_no text;
  v_invoice_id uuid;
  v_invoice_no text;
  v_item record;
  v_charge record;
  v_sku public.pos_skus%rowtype;
  v_price record;
  v_total bigint := 0;
  v_sku_ids uuid[];
  v_stock integer;
  v_sku_label text;
  v_result jsonb;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date := p_due_date;
  v_operator uuid;
  v_tx_type text := 'SALE';
  v_fulfill text := 'DELIVERED';
  v_any_zero boolean := false;
  v_insufficient boolean := false;
  v_insufficient_label text;
  v_adj bigint;
  v_actual_unit bigint;
  v_line_total bigint;
  v_today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_pickup timestamptz := p_pickup_due_at;
  v_charge_name text;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_sale');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    v_operator := pos_private.resolve_operator_staff_id(p_operator_staff_id);

    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Giỏ hàng trống' using errcode = '22023';
    end if;

    select array_agg(x.sku_id order by x.sku_id)
    into v_sku_ids
    from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint);

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
      group by x.sku_id having count(*) > 1
    ) then
      raise exception 'SKU trùng trong giỏ hàng' using errcode = '22023';
    end if;

    perform s.sku_id
    from public.pos_inventory_stock s
    where s.sku_id = any(v_sku_ids)
    order by s.sku_id
    for update;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
    loop
      if v_item.quantity is null or v_item.quantity <= 0 then
        raise exception 'Số lượng bán phải > 0' using errcode = '22023';
      end if;
      select quantity into v_stock
      from public.pos_inventory_stock
      where sku_id = v_item.sku_id;
      if v_stock is null then
        raise exception 'SKU không tồn tại trên sổ kho' using errcode = 'P0001';
      end if;
      if v_stock = 0 then
        v_any_zero := true;
      elsif v_stock < v_item.quantity then
        v_insufficient := true;
        select coalesce(sku || ' - ' || name, v_item.sku_id::text)
        into v_insufficient_label
        from public.pos_skus
        where id = v_item.sku_id;
      end if;
    end loop;

    if v_insufficient then
      raise exception
        'Không đủ tồn kho cho %',
        coalesce(v_insufficient_label, 'sản phẩm')
        using errcode = 'P0001';
    end if;

    if v_any_zero then
      v_tx_type := 'PREORDER';
      v_fulfill := 'UNFULFILLED';
      if v_pickup is null then
        raise exception 'Đơn đặt hàng phải có ngày giờ hẹn lấy hàng' using errcode = '22023';
      end if;
      if v_pickup < now() then
        raise exception 'Hẹn lấy hàng không được trước thời điểm đặt' using errcode = '22023';
      end if;
    else
      v_pickup := null;
    end if;

    if p_customer_id is not null then
      select c.id into v_customer_id
      from public.pos_customers c
      where c.id = p_customer_id;
      if v_customer_id is null then
        raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
      end if;
    else
      v_customer_id := pos_private.upsert_customer(p_customer_name, p_customer_phone);
    end if;

    if v_tx_type = 'PREORDER' then
      v_sale_no := 'PRE-' || lpad(nextval('public.pos_preorder_seq')::text, 6, '0');
      v_invoice_no := 'DH' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
    else
      v_sale_no := 'SALE-' || lpad(nextval('public.pos_sale_seq')::text, 6, '0');
      v_invoice_no := 'HD' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
    end if;

    insert into public.pos_sales (
      sale_no, customer_id, status, payment_method, total_dong,
      idempotency_key, actor_email, completed_at, note,
      transaction_type, operator_staff_id, pickup_due_at, fulfillment_status
    ) values (
      v_sale_no, v_customer_id, 'COMPLETED', p_payment_method, 0,
      trim(p_idempotency_key), v_actor, now(), v_note,
      v_tx_type, v_operator, v_pickup, v_fulfill
    )
    returning id into v_sale_id;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
    loop
      select * into v_sku from public.pos_skus where id = v_item.sku_id and is_active;
      if v_sku.id is null then
        raise exception 'SKU không hoạt động' using errcode = 'P0001';
      end if;
      if v_sku.weight_chi is null or v_sku.weight_chi <= 0 then
        raise exception 'Trọng lượng sản phẩm không hợp lệ' using errcode = '22023';
      end if;

      select * into v_price from pos_private.compute_unit_price(v_sku);
      v_adj := coalesce(v_item.price_adjustment_per_chi, 0);

      perform pos_private.assert_price_within_or_exception(
        round(v_price.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint + v_adj,
        round(v_price.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint,
        false,
        false,
        null
      );

      v_actual_unit := v_price.unit_price_dong + round(v_adj * v_sku.weight_chi)::bigint;
      if v_actual_unit < 0 then
        raise exception 'Giá giao dịch không hợp lệ' using errcode = '22023';
      end if;
      v_line_total := v_actual_unit * v_item.quantity;

      insert into public.pos_sale_items (
        sale_id, sku_id, quantity, unit_price_dong, total_price_dong,
        gold_sell_dong, weight_chi, board_unit_chi, labor_fee_dong, price_row_id,
        product_name_snapshot, sku_snapshot, reference_unit_price_dong, price_adjustment_per_chi
      ) values (
        v_sale_id, v_sku.id, v_item.quantity, v_actual_unit, v_line_total,
        v_price.gold_sell_dong, v_sku.weight_chi, v_sku.board_unit_chi,
        v_sku.labor_fee_dong, v_sku.price_row_id,
        v_sku.name, v_sku.sku, v_price.unit_price_dong, v_adj
      );

      if v_adj <> 0 then
        insert into public.pos_price_exceptions (
          transaction_type, transaction_id, line_id,
          reference_price_dong_per_chi, actual_price_dong_per_chi,
          difference_per_chi, weight_chi, reason, created_by
        )
        select
          'SALE', v_sale_id, si.id,
          round(v_price.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint,
          round(v_price.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint + v_adj,
          v_adj, v_sku.weight_chi,
          'Điều chỉnh giá POS ±300.000đ/chỉ', v_actor
        from public.pos_sale_items si
        where si.sale_id = v_sale_id and si.sku_id = v_sku.id
        order by si.id desc
        limit 1;
      end if;

      v_total := v_total + v_line_total;
    end loop;

    if p_charges is not null and jsonb_typeof(p_charges) = 'array' then
      for v_charge in
        select * from jsonb_to_recordset(p_charges) as x(name text, amount_dong bigint, reason text)
      loop
        v_charge_name := nullif(trim(coalesce(v_charge.name, '')), '');
        if v_charge_name is null then
          raise exception 'Khoản phải thu phải có tên' using errcode = '22023';
        end if;
        if v_charge.amount_dong is null or v_charge.amount_dong <= 0 then
          raise exception 'Số tiền khoản phải thu phải > 0' using errcode = '22023';
        end if;
        insert into public.pos_sale_charges (sale_id, name, amount_dong, reason, created_by)
        values (
          v_sale_id,
          v_charge_name,
          v_charge.amount_dong,
          nullif(trim(coalesce(v_charge.reason, '')), ''),
          v_actor
        );
        v_total := v_total + v_charge.amount_dong;
      end loop;
    end if;

    v_paid := coalesce(p_paid_dong, v_total);
    if v_paid < 0 then
      raise exception 'Số tiền thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if v_paid > v_total then
      raise exception 'Số tiền thanh toán vượt tổng đơn' using errcode = '22023';
    end if;
    v_remaining := v_total - v_paid;
    if v_remaining > 0 then
      if v_due is null then
        raise exception 'Đơn còn nợ phải có ngày hẹn trả' using errcode = '22023';
      end if;
      if v_due < v_today then
        raise exception 'Ngày hẹn thanh toán không được trong quá khứ' using errcode = '22023';
      end if;
    else
      v_due := null;
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_total, v_due);

    update public.pos_sales
    set
      total_dong = v_total,
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due
    where id = v_sale_id;

    insert into public.pos_invoices (
      invoice_no, sale_id, customer_id, status, total_dong, issued_at, actor_email
    ) values (
      v_invoice_no, v_sale_id, v_customer_id, 'ISSUED', v_total, now(), v_actor
    )
    returning id into v_invoice_id;

    if v_paid > 0 then
      insert into public.pos_sale_payments (
        sale_id, amount_dong, payment_method, paid_at, actor_email, note,
        idempotency_key, received_by_staff_id
      ) values (
        v_sale_id, v_paid, p_payment_method, now(), v_actor,
        'Thanh toán lúc bán',
        'sale-open:' || trim(p_idempotency_key),
        v_operator
      );
    end if;

    if v_tx_type = 'SALE' then
      for v_item in
        select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
      loop
        perform pos_private.apply_stock_change(
          v_item.sku_id,
          - v_item.quantity,
          'SALE',
          'Bán hàng',
          'SALE',
          v_sale_id,
          v_actor
        );
      end loop;
    end if;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor,
      case when v_tx_type = 'PREORDER' then 'PREORDER_CREATE' else 'SALE' end,
      'sale',
      v_sale_id,
      case when v_tx_type = 'PREORDER' then 'Tạo đơn đặt hàng' else 'Bán hàng' end,
      jsonb_build_object(
        'sale_no', v_sale_no,
        'invoice_no', v_invoice_no,
        'invoice_id', v_invoice_id,
        'customer_id', v_customer_id,
        'total_dong', v_total,
        'paid_dong', v_paid,
        'remaining_dong', v_remaining,
        'payment_status', v_pay_status,
        'due_date', v_due,
        'transaction_type', v_tx_type,
        'fulfillment_status', v_fulfill,
        'pickup_due_at', v_pickup,
        'operator_staff_id', v_operator,
        'login_account', v_actor
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'sale_id', v_sale_id,
      'sale_no', v_sale_no,
      'invoice_id', v_invoice_id,
      'invoice_no', v_invoice_no,
      'customer_id', v_customer_id,
      'total_dong', v_total,
      'paid_dong', v_paid,
      'remaining_dong', v_remaining,
      'payment_status', v_pay_status,
      'due_date', v_due,
      'status', 'COMPLETED',
      'transaction_type', v_tx_type,
      'fulfillment_status', v_fulfill,
      'pickup_due_at', v_pickup,
      'operator_staff_id', v_operator
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

drop function if exists public.pos_complete_sale(text, text, text, text, jsonb, uuid, text, bigint, date);

create or replace function public.pos_complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_charges jsonb default '[]'::jsonb,
  p_operator_staff_id uuid default null,
  p_pickup_due_at timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method,
    p_items, p_customer_id, p_note, p_paid_dong, p_due_date,
    p_charges, p_operator_staff_id, p_pickup_due_at
  );
$$;

revoke all on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
) from public, anon;
grant execute on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
) to authenticated;
