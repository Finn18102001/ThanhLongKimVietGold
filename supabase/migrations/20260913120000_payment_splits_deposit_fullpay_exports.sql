-- Payment splits (MIXED), DEPOSIT when pickup hold even if fully paid,
-- held-order adjusted unit price, export unitPriceDong.

-- ---------------------------------------------------------------------------
-- 1) Allow MIXED on pos_sales header (payment rows stay CASH/TRANSFER/CARD)
-- ---------------------------------------------------------------------------
alter table public.pos_sales drop constraint if exists pos_sales_payment_check;
alter table public.pos_sales add constraint pos_sales_payment_check
  check (payment_method = any (array['CASH','TRANSFER','CARD','MIXED']));

-- ---------------------------------------------------------------------------
-- 2) Replace pos_private.complete_sale (12-arg → 13-arg with p_payment_splits)
-- ---------------------------------------------------------------------------
drop function if exists pos_private.complete_sale(
  text, text, text, text, jsonb, uuid, text
);
drop function if exists pos_private.complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date
);
drop function if exists pos_private.complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
);

create function pos_private.complete_sale(
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
  p_pickup_due_at timestamptz default null,
  p_payment_splits jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_result jsonb;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date := p_due_date;
  v_operator uuid;
  v_tx_type text := 'SALE';
  v_fulfill text := 'DELIVERED';
  v_any_short boolean := false;
  v_adj bigint;
  v_actual_unit bigint;
  v_line_total bigint;
  v_today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_pickup timestamptz := p_pickup_due_at;
  v_charge_name text;
  v_deposit_wf text := null;
  v_avail integer;
  v_item_status text;
  v_split record;
  v_split_sum bigint := 0;
  v_sale_method text := p_payment_method;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_sale');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    v_operator := pos_private.resolve_operator_staff_id(p_operator_staff_id);

    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD', 'MIXED') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Giỏ hàng trống' using errcode = '22023';
    end if;

    select array_agg(x.sku_id order by x.sku_id) into v_sku_ids
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
      select quantity into v_stock from public.pos_inventory_stock where sku_id = v_item.sku_id;
      if v_stock is null then
        raise exception 'SKU không tồn tại trên sổ kho' using errcode = 'P0001';
      end if;
      if v_stock < v_item.quantity then
        v_any_short := true;
      end if;
    end loop;

    if v_any_short then
      v_tx_type := 'PREORDER';
      v_fulfill := 'UNFULFILLED';
      if v_pickup is null then
        raise exception 'Đơn đặt hàng phải có ngày giờ hẹn lấy hàng' using errcode = '22023';
      end if;
      if v_pickup < now() then
        raise exception 'Hẹn lấy hàng không được trước thời điểm đặt' using errcode = '22023';
      end if;
    end if;

    if p_customer_id is not null then
      select c.id into v_customer_id from public.pos_customers c where c.id = p_customer_id;
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
      transaction_type, operator_staff_id, pickup_due_at, fulfillment_status,
      deposit_workflow_status, deposit_price_locked
    ) values (
      v_sale_no, v_customer_id, 'COMPLETED', p_payment_method, 0,
      trim(p_idempotency_key), v_actor, now(), v_note,
      v_tx_type, v_operator, v_pickup, v_fulfill,
      null, true
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
        false, false, null
      );

      v_actual_unit := v_price.unit_price_dong + round(v_adj * v_sku.weight_chi)::bigint;
      if v_actual_unit < 0 then
        raise exception 'Giá giao dịch không hợp lệ' using errcode = '22023';
      end if;
      v_line_total := v_actual_unit * v_item.quantity;

      select quantity into v_stock from public.pos_inventory_stock where sku_id = v_item.sku_id;
      v_avail := least(greatest(coalesce(v_stock, 0), 0), v_item.quantity);
      if v_avail >= v_item.quantity then
        v_item_status := 'IN_STOCK';
      else
        v_item_status := 'BACKORDER';
      end if;

      insert into public.pos_sale_items (
        sale_id, sku_id, quantity, unit_price_dong, total_price_dong,
        gold_sell_dong, weight_chi, board_unit_chi, labor_fee_dong, price_row_id,
        product_name_snapshot, sku_snapshot, reference_unit_price_dong, price_adjustment_per_chi,
        qty_available_at_order, qty_delivered, item_status
      ) values (
        v_sale_id, v_sku.id, v_item.quantity, v_actual_unit, v_line_total,
        v_price.gold_sell_dong, v_sku.weight_chi, v_sku.board_unit_chi,
        v_sku.labor_fee_dong, v_sku.price_row_id,
        v_sku.name, v_sku.sku, v_price.unit_price_dong, v_adj,
        v_avail, 0, v_item_status
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
          v_sale_id, v_charge_name, v_charge.amount_dong,
          nullif(trim(coalesce(v_charge.reason, '')), ''), v_actor
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

    -- In-stock + (còn nợ OR có hẹn giao vàng) → DEPOSIT (giữ vàng; kể cả đã TT đủ)
    if v_tx_type = 'SALE' and (v_remaining > 0 or v_pickup is not null) then
      v_tx_type := 'DEPOSIT';
      v_fulfill := 'UNFULFILLED';
      v_deposit_wf := 'AWAITING_AGREEMENT';
      if v_pickup is null then
        raise exception 'Đặt cọc / giữ vàng phải có thời gian dự kiến giao vàng' using errcode = '22023';
      end if;
      if v_pickup < now() then
        raise exception 'Thời gian dự kiến giao vàng không được trước thời điểm đặt' using errcode = '22023';
      end if;
      v_sale_no := 'DC-' || lpad(nextval('public.pos_deposit_sale_seq')::text, 6, '0');
    elsif v_tx_type = 'PREORDER' and v_remaining > 0 then
      v_deposit_wf := 'AWAITING_AGREEMENT';
    elsif v_tx_type = 'SALE' then
      v_pickup := null;
    end if;

    update public.pos_sales
    set
      sale_no = v_sale_no,
      total_dong = v_total,
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due,
      transaction_type = v_tx_type,
      fulfillment_status = v_fulfill,
      pickup_due_at = v_pickup,
      deposit_workflow_status = v_deposit_wf
    where id = v_sale_id;

    insert into public.pos_invoices (
      invoice_no, sale_id, customer_id, status, total_dong, issued_at, actor_email
    ) values (
      v_invoice_no, v_sale_id, v_customer_id, 'ISSUED', v_total, now(), v_actor
    )
    returning id into v_invoice_id;

    if v_paid > 0 then
      if p_payment_splits is not null
         and jsonb_typeof(p_payment_splits) = 'array'
         and jsonb_array_length(p_payment_splits) > 0 then
        for v_split in
          select * from jsonb_to_recordset(p_payment_splits) as x(method text, amount_dong bigint)
        loop
          if v_split.method not in ('CASH', 'TRANSFER') then
            raise exception 'Hình thức thanh toán không hợp lệ' using errcode = '22023';
          end if;
          if v_split.amount_dong is null or v_split.amount_dong <= 0 then
            raise exception 'Số tiền theo hình thức phải > 0' using errcode = '22023';
          end if;
          v_split_sum := v_split_sum + v_split.amount_dong;
          insert into public.pos_sale_payments (
            sale_id, amount_dong, payment_method, paid_at, actor_email, note,
            idempotency_key, received_by_staff_id
          ) values (
            v_sale_id, v_split.amount_dong, v_split.method, now(), v_actor,
            case
              when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán'
              else 'Thanh toán lúc bán'
            end,
            'sale-open:' || trim(p_idempotency_key) || ':' || v_split.method,
            v_operator
          );
        end loop;
        if v_split_sum <> v_paid then
          raise exception 'Tổng các khoản thanh toán phải khớp số tiền thu' using errcode = '22023';
        end if;
        if (
          select count(distinct x.method)
          from jsonb_to_recordset(p_payment_splits) as x(method text, amount_dong bigint)
        ) > 1 then
          v_sale_method := 'MIXED';
        else
          select x.method into v_sale_method
          from jsonb_to_recordset(p_payment_splits) as x(method text, amount_dong bigint)
          limit 1;
        end if;
        update public.pos_sales
        set payment_method = v_sale_method
        where id = v_sale_id;
      else
        if p_payment_method = 'MIXED' then
          raise exception 'Thanh toán hỗn hợp cần tách số tiền từng hình thức' using errcode = '22023';
        end if;
        insert into public.pos_sale_payments (
          sale_id, amount_dong, payment_method, paid_at, actor_email, note,
          idempotency_key, received_by_staff_id
        ) values (
          v_sale_id, v_paid, p_payment_method, now(), v_actor,
          case
            when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán'
            else 'Thanh toán lúc bán'
          end,
          'sale-open:' || trim(p_idempotency_key),
          v_operator
        );
      end if;
    end if;

    -- Chỉ SALE đầy đủ mới trừ kho ngay + đánh dấu đã giao đủ
    if v_tx_type = 'SALE' then
      for v_item in
        select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
      loop
        perform pos_private.apply_stock_change(
          v_item.sku_id, - v_item.quantity,
          'SALE', 'Bán hàng', 'SALE', v_sale_id, v_actor
        );
      end loop;
      update public.pos_sale_items
      set qty_delivered = quantity, item_status = 'DELIVERED'
      where sale_id = v_sale_id;
    else
      -- header READY if no backorder lines (e.g. DEPOSIT all in stock)
      perform pos_private.sync_sale_fulfillment_header(v_sale_id);
    end if;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor,
      case
        when v_tx_type = 'PREORDER' then 'PREORDER_CREATE'
        when v_tx_type = 'DEPOSIT' then 'DEPOSIT_CREATE'
        else 'SALE'
      end,
      'sale', v_sale_id,
      case
        when v_tx_type = 'PREORDER' then 'Tạo đơn đặt hàng'
        when v_tx_type = 'DEPOSIT' then 'Tạo đơn đặt cọc / TT một phần'
        else 'Bán hàng'
      end,
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
        'deposit_workflow_status', v_deposit_wf,
        'payment_method', v_sale_method,
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
      'fulfillment_status', (
        select fulfillment_status from public.pos_sales where id = v_sale_id
      ),
      'pickup_due_at', v_pickup,
      'deposit_workflow_status', v_deposit_wf,
      'payment_method', v_sale_method,
      'operator_staff_id', v_operator
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

-- Thin private overloads → pass null for p_payment_splits
create function pos_private.complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method, p_items,
    p_customer_id, p_note, null::bigint, null::date, '[]'::jsonb, null::uuid,
    null::timestamptz, null::jsonb
  );
$function$;

create function pos_private.complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method, p_items,
    p_customer_id, p_note, p_paid_dong, p_due_date, '[]'::jsonb, null::uuid,
    null::timestamptz, null::jsonb
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3) Public wrappers: pos_complete_sale + pos_complete_held_sale
-- ---------------------------------------------------------------------------
drop function if exists public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
);

create function public.pos_complete_sale(
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
  p_pickup_due_at timestamptz default null,
  p_payment_splits jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform pos_private.require_real_customer_id(p_customer_id);
  return pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method,
    p_items, p_customer_id, p_note, p_paid_dong, p_due_date,
    p_charges, p_operator_staff_id, p_pickup_due_at, p_payment_splits
  );
end;
$function$;

revoke all on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz, jsonb
) from public, anon;
grant execute on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz, jsonb
) to authenticated;

-- Keep 9-arg public overload; pass null splits through full private
create or replace function public.pos_complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform pos_private.require_real_customer_id(p_customer_id);
  return pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method,
    p_items, p_customer_id, p_note, p_paid_dong, p_due_date,
    '[]'::jsonb, null::uuid, null::timestamptz, null::jsonb
  );
end;
$function$;

revoke all on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date
) from public, anon;
grant execute on function public.pos_complete_sale(
  text, text, text, text, jsonb, uuid, text, bigint, date
) to authenticated;

drop function if exists public.pos_complete_held_sale(
  uuid, text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz
);

create function public.pos_complete_held_sale(
  p_held_order_id uuid,
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
  p_pickup_due_at timestamptz default null,
  p_payment_splits jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text;
  v_hold public.pos_held_orders%rowtype;
  v_result jsonb;
  v_sale_id uuid;
begin
  v_actor := pos_private.require_pos_user();
  select * into v_hold from public.pos_held_orders h where h.id = p_held_order_id for update;
  if not found then
    raise exception 'Không tìm thấy đơn đã lưu' using errcode = 'P0001';
  end if;
  if not pos_private.can_access_held_order(v_hold.saved_by_email) then
    raise exception 'Không thanh toán được đơn đã lưu của tài khoản khác' using errcode = '42501';
  end if;
  if v_hold.status = 'COMPLETED' then
    select jsonb_build_object(
      'ok', true,
      'sale_id', s.id,
      'sale_no', s.sale_no,
      'invoice_no', i.invoice_no,
      'total_dong', s.total_dong,
      'paid_dong', s.paid_dong,
      'remaining_dong', s.remaining_dong,
      'payment_status', s.payment_status,
      'due_date', s.due_date,
      'status', s.status,
      'transaction_type', s.transaction_type,
      'fulfillment_status', s.fulfillment_status,
      'held_order_id', v_hold.id,
      'hold_no', v_hold.hold_no
    )
    into v_result
    from public.pos_sales s
    left join public.pos_invoices i on i.sale_id = s.id
    where s.id = v_hold.completed_sale_id
    limit 1;
    if v_result is null then
      raise exception 'Đơn đã lưu không còn mở để thanh toán' using errcode = 'P0001';
    end if;
    return v_result;
  end if;
  if v_hold.status <> 'HELD' then
    raise exception 'Đơn đã lưu không còn mở để thanh toán' using errcode = 'P0001';
  end if;

  v_result := pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method, p_items,
    p_customer_id, p_note, p_paid_dong, p_due_date,
    p_charges, p_operator_staff_id, p_pickup_due_at, p_payment_splits
  );

  select s.id into v_sale_id
  from public.pos_sales s
  where s.sale_no = v_result ->> 'sale_no'
  limit 1;

  update public.pos_held_orders
  set status = 'COMPLETED', completed_sale_id = v_sale_id, updated_at = now()
  where id = v_hold.id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'HELD_ORDER_COMPLETE', 'HELD_ORDER', v_hold.id,
    'Thanh toán đơn đã lưu. Đơn lưu đóng, hóa đơn phát hành theo giao dịch bán.',
    jsonb_build_object(
      'hold_no', v_hold.hold_no,
      'sale_no', v_result ->> 'sale_no',
      'invoice_no', v_result ->> 'invoice_no'
    )
  );

  return v_result || jsonb_build_object('held_order_id', v_hold.id, 'hold_no', v_hold.hold_no);
end;
$function$;

revoke all on function public.pos_complete_held_sale(
  uuid, text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz, jsonb
) from public, anon;
grant execute on function public.pos_complete_held_sale(
  uuid, text, text, text, text, jsonb, uuid, text, bigint, date, jsonb, uuid, timestamptz, jsonb
) to authenticated;

-- Thin held complete still routes via 9-arg private (null splits)
create or replace function public.pos_complete_held_sale(
  p_held_order_id uuid,
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor text;
  v_hold public.pos_held_orders%rowtype;
  v_result jsonb;
  v_sale_id uuid;
begin
  v_actor := pos_private.require_pos_user();

  select * into v_hold
  from public.pos_held_orders h
  where h.id = p_held_order_id
  for update;

  if not found then
    raise exception 'Không tìm thấy đơn đã lưu' using errcode = 'P0001';
  end if;
  if not pos_private.can_access_held_order(v_hold.saved_by_email) then
    raise exception 'Không thanh toán được đơn đã lưu của tài khoản khác' using errcode = '42501';
  end if;
  if v_hold.status = 'COMPLETED' then
    select jsonb_build_object(
      'ok', true,
      'sale_id', s.id,
      'sale_no', s.sale_no,
      'invoice_no', i.invoice_no,
      'total_dong', s.total_dong,
      'paid_dong', s.paid_dong,
      'remaining_dong', s.remaining_dong,
      'payment_status', s.payment_status,
      'due_date', s.due_date,
      'status', s.status,
      'held_order_id', v_hold.id,
      'hold_no', v_hold.hold_no
    )
    into v_result
    from public.pos_sales s
    left join public.pos_invoices i on i.sale_id = s.id
    where s.id = v_hold.completed_sale_id
    limit 1;
    if v_result is null then
      raise exception 'Đơn đã lưu không còn mở để thanh toán' using errcode = 'P0001';
    end if;
    return v_result;
  end if;
  if v_hold.status <> 'HELD' then
    raise exception 'Đơn đã lưu không còn mở để thanh toán' using errcode = 'P0001';
  end if;

  v_result := pos_private.complete_sale(
    p_idempotency_key,
    p_customer_name,
    p_customer_phone,
    p_payment_method,
    p_items,
    p_customer_id,
    p_note,
    p_paid_dong,
    p_due_date,
    '[]'::jsonb,
    null::uuid,
    null::timestamptz,
    null::jsonb
  );

  select s.id into v_sale_id
  from public.pos_sales s
  where s.sale_no = v_result ->> 'sale_no'
  limit 1;

  update public.pos_held_orders
  set
    status = 'COMPLETED',
    completed_sale_id = v_sale_id,
    updated_at = now()
  where id = v_hold.id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor,
    'HELD_ORDER_COMPLETE',
    'HELD_ORDER',
    v_hold.id,
    'Thanh toán đơn đã lưu. Đơn lưu đóng, hóa đơn phát hành theo giao dịch bán.',
    jsonb_build_object(
      'hold_no', v_hold.hold_no,
      'sale_no', v_result ->> 'sale_no',
      'invoice_no', v_result ->> 'invoice_no'
    )
  );

  return v_result || jsonb_build_object('held_order_id', v_hold.id, 'hold_no', v_hold.hold_no);
end;
$function$;

revoke all on function public.pos_complete_held_sale(
  uuid, text, text, text, text, jsonb, uuid, text, bigint, date
) from public, anon;
grant execute on function public.pos_complete_held_sale(
  uuid, text, text, text, text, jsonb, uuid, text, bigint, date
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Held order: persist adjusted unit price (via replace_held_order_items)
-- ---------------------------------------------------------------------------
create or replace function pos_private.replace_held_order_items(
  p_hold_id uuid,
  p_items jsonb
)
returns table(item_count integer, estimated_total_dong bigint)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
  v_sku public.pos_skus%rowtype;
  v_price record;
  v_count integer := 0;
  v_total bigint := 0;
  v_sort integer := 0;
  v_line bigint;
  v_adj bigint;
  v_unit bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Chưa chọn sản phẩm để lưu đơn' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
    group by x.sku_id
    having count(*) > 1
  ) then
    raise exception 'Giỏ hàng có mã trùng' using errcode = '22023';
  end if;

  delete from public.pos_held_order_items where held_order_id = p_hold_id;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
  loop
    if v_item.sku_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Dòng hàng lưu đơn không hợp lệ' using errcode = '22023';
    end if;

    select * into v_sku from public.pos_skus s where s.id = v_item.sku_id;
    if not found or not v_sku.is_active then
      raise exception 'Sản phẩm không còn bán được' using errcode = 'P0001';
    end if;

    select * into v_price from pos_private.compute_unit_price(v_sku);
    v_adj := coalesce(v_item.price_adjustment_per_chi, 0);
    v_unit := v_price.unit_price_dong + round(v_adj * v_sku.weight_chi)::bigint;
    if v_unit < 0 then
      raise exception 'Giá giao dịch không hợp lệ' using errcode = '22023';
    end if;
    v_line := v_unit * v_item.quantity;
    v_sort := v_sort + 1;
    v_count := v_count + 1;
    v_total := v_total + v_line;

    insert into public.pos_held_order_items (
      held_order_id, sku_id, sku, name, quantity, unit_price_dong, line_total_dong, sort_index
    ) values (
      p_hold_id,
      v_sku.id,
      v_sku.sku,
      v_sku.name,
      v_item.quantity,
      v_unit,
      v_line,
      v_sort
    );
  end loop;

  item_count := v_count;
  estimated_total_dong := v_total;
  return next;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Export unitPriceDong — transactions + documents
-- ---------------------------------------------------------------------------
create or replace function public.pos_export_transactions(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform pos_private.require_admin();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Khoảng ngày không hợp lệ' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t."completedAt" desc, t."code", t."productName")
    from (
      select
        'SELL'::text as "type",
        s.sale_no as "code",
        i.invoice_no as "invoiceNo",
        c.name as "customerName",
        c.phone as "customerPhone",
        si.total_price_dong as "totalDong",
        s.paid_dong as "paidDong",
        s.remaining_dong as "remainingDong",
        s.payment_status as "paymentStatus",
        s.payment_method as "paymentMethod",
        s.due_date as "dueDate",
        s.actor_email as "actorEmail",
        s.completed_at as "completedAt",
        si.quantity::bigint as "quantitySold",
        (si.quantity * si.weight_chi)::numeric as "weightChiSold",
        coalesce(nullif(trim(si.sku_snapshot), ''), sk.sku, '') as "sku",
        coalesce(nullif(trim(br.name), ''), '') as "brandName",
        coalesce(nullif(trim(si.product_name_snapshot), ''), sk.name, '') as "productName",
        coalesce(s.note, '') as "note",
        si.unit_price_dong as "unitPriceDong"
      from public.pos_sales s
      join public.pos_customers c on c.id = s.customer_id
      join public.pos_sale_items si on si.sale_id = s.id
      left join public.pos_invoices i on i.sale_id = s.id
      left join public.pos_skus sk on sk.id = si.sku_id
      left join public.brands br on br.id = sk.brand_id
      where s.status = 'COMPLETED'
        and s.completed_at::date >= p_from
        and s.completed_at::date <= p_to

      union all

      select
        'BUY'::text,
        b.buy_no,
        null::text,
        c.name,
        c.phone,
        bi.total_price_dong,
        b.paid_dong,
        b.remaining_dong,
        b.payment_status,
        b.payment_method,
        b.due_date,
        b.actor_email,
        b.completed_at,
        bi.quantity::bigint,
        (bi.quantity * bi.weight_chi)::numeric,
        coalesce(sk.sku, '') as "sku",
        coalesce(nullif(trim(bi.brand_name), ''), br.name, '') as "brandName",
        coalesce(nullif(trim(bi.product_name_snapshot), ''), sk.name, '') as "productName",
        coalesce(b.note, '') as "note",
        bi.unit_price_dong as "unitPriceDong"
      from public.pos_buys b
      join public.pos_customers c on c.id = b.customer_id
      join public.pos_buy_items bi on bi.buy_id = b.id
      left join public.pos_skus sk on sk.id = bi.sku_id
      left join public.brands br on br.id = coalesce(bi.brand_id, sk.brand_id)
      where b.status = 'COMPLETED'
        and b.completed_at::date >= p_from
        and b.completed_at::date <= p_to
    ) t
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.pos_export_transactions(date, date) from public, anon;
grant execute on function public.pos_export_transactions(date, date) to authenticated;

create or replace function public.pos_export_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_q text := lower(nullif(trim(coalesce(p_q, '')), ''));
  v_doc_limit int := case
    when p_limit is null or p_limit <= 0 then 5000
    else least(greatest(p_limit, 1), 2000)
  end;
  v_result jsonb;
begin
  perform pos_private.require_pos_user();
  if p_document_type is not null and p_document_type not in (
    'SALE_TO_CUSTOMER', 'PURCHASE_FROM_CUSTOMER', 'STOCK_RECEIPT'
  ) then
    raise exception 'Loại chứng từ không hợp lệ' using errcode = '22023';
  end if;
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'
  ) then
    raise exception 'Trạng thái thanh toán không hợp lệ' using errcode = '22023';
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
      s.id as sale_id,
      null::uuid as buy_id,
      null::uuid as receipt_id,
      s.note,
      s.pickup_due_at,
      (
        select min(t.created_at)
        from public.pos_inventory_transactions t
        where t.reference_id = s.id
          and t.type in ('PREORDER_FULFILL', 'SALE')
      ) as gold_delivered_at,
      (
        select p.amount_dong
        from public.pos_sale_payments p
        where p.sale_id = s.id
        order by p.paid_at asc, p.id asc
        limit 1
      ) as first_paid_dong,
      (
        select coalesce(sum(p.amount_dong), 0)::bigint
        from public.pos_sale_payments p
        where p.sale_id = s.id
          and p.id <> (
            select p0.id
            from public.pos_sale_payments p0
            where p0.sale_id = s.id
            order by p0.paid_at asc, p0.id asc
            limit 1
          )
      ) as second_paid_dong
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    join public.pos_customers c on c.id = i.customer_id
    where s.status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'SALE_TO_CUSTOMER')
      and (p_from is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or s.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(i.invoice_no) like '%' || v_q || '%'
        or lower(s.sale_no) like '%' || v_q || '%'
        or lower(c.name) like '%' || v_q || '%'
        or lower(c.phone) like '%' || v_q || '%'
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
      null::uuid,
      b.id,
      null::uuid,
      b.note,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::bigint
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where (
        b.status = 'COMPLETED'
        or (
          b.status = 'PROCESSING'
          and b.workflow_status in ('INVOICE_ISSUED', 'FORM02_READY')
        )
      )
      and (p_document_type is null or p_document_type = 'PURCHASE_FROM_CUSTOMER')
      and (p_from is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or b.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(b.buy_no) like '%' || v_q || '%'
        or lower(coalesce(b.customer_name_snapshot, c.name)) like '%' || v_q || '%'
        or lower(coalesce(b.customer_phone_snapshot, c.phone)) like '%' || v_q || '%'
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
      null::uuid,
      null::uuid,
      r.id,
      r.note,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::bigint
    from public.pos_purchase_receipts r
    where r.document_status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(r.receipt_no) like '%' || v_q || '%'
        or lower(r.supplier_name) like '%' || v_q || '%'
      )
  ),
  counted as (
    select count(*)::int as total from docs
  ),
  limited_docs as (
    select d.*
    from docs d
    order by d.issued_at desc, d.document_no
    limit v_doc_limit
  ),
  lines as (
    select
      d.id,
      d.document_no,
      d.document_type,
      d.issued_at,
      d.party_name,
      d.party_phone,
      d.total_dong,
      d.paid_dong,
      d.remaining_dong,
      d.payment_status,
      d.payment_method,
      d.ref_no,
      coalesce(nullif(trim(si.product_name_snapshot), ''), sk.name, '') as product_name,
      si.quantity::numeric as quantity,
      si.weight_chi as weight_chi,
      coalesce(nullif(trim(br.name), ''), '') as brand_name,
      coalesce(d.note, '') as note,
      d.pickup_due_at,
      d.gold_delivered_at,
      d.first_paid_dong,
      d.second_paid_dong,
      si.unit_price_dong as unit_price_dong,
      1 as line_ord
    from limited_docs d
    join public.pos_sale_items si on si.sale_id = d.sale_id
    left join public.pos_skus sk on sk.id = si.sku_id
    left join public.brands br on br.id = sk.brand_id
    where d.document_type = 'SALE_TO_CUSTOMER'

    union all

    select
      d.id,
      d.document_no,
      d.document_type,
      d.issued_at,
      d.party_name,
      d.party_phone,
      d.total_dong,
      d.paid_dong,
      d.remaining_dong,
      d.payment_status,
      d.payment_method,
      d.ref_no,
      coalesce(nullif(trim(bi.product_name_snapshot), ''), sk.name, '') as product_name,
      bi.quantity::numeric,
      bi.weight_chi,
      coalesce(nullif(trim(bi.brand_name), ''), br.name, ''),
      coalesce(d.note, ''),
      d.pickup_due_at,
      d.gold_delivered_at,
      d.first_paid_dong,
      d.second_paid_dong,
      bi.unit_price_dong,
      1
    from limited_docs d
    join public.pos_buy_items bi on bi.buy_id = d.buy_id
    left join public.pos_skus sk on sk.id = bi.sku_id
    left join public.brands br on br.id = coalesce(bi.brand_id, sk.brand_id)
    where d.document_type = 'PURCHASE_FROM_CUSTOMER'

    union all

    select
      d.id,
      d.document_no,
      d.document_type,
      d.issued_at,
      d.party_name,
      d.party_phone,
      d.total_dong,
      d.paid_dong,
      d.remaining_dong,
      d.payment_status,
      d.payment_method,
      d.ref_no,
      coalesce(sk.name, '') as product_name,
      pi.received_qty::numeric,
      sk.weight_chi,
      coalesce(nullif(trim(br.name), ''), ''),
      coalesce(d.note, ''),
      d.pickup_due_at,
      d.gold_delivered_at,
      d.first_paid_dong,
      d.second_paid_dong,
      coalesce(pi.cost_price_dong, 0)::bigint,
      1
    from limited_docs d
    join public.pos_purchase_items pi on pi.receipt_id = d.receipt_id
    left join public.pos_skus sk on sk.id = pi.sku_id
    left join public.brands br on br.id = sk.brand_id
    where d.document_type = 'STOCK_RECEIPT'

    union all

    select
      d.id,
      d.document_no,
      d.document_type,
      d.issued_at,
      d.party_name,
      d.party_phone,
      d.total_dong,
      d.paid_dong,
      d.remaining_dong,
      d.payment_status,
      d.payment_method,
      d.ref_no,
      ''::text,
      null::numeric,
      null::numeric,
      ''::text,
      coalesce(d.note, ''),
      d.pickup_due_at,
      d.gold_delivered_at,
      d.first_paid_dong,
      d.second_paid_dong,
      null::bigint,
      0
    from limited_docs d
    where (
      d.document_type = 'SALE_TO_CUSTOMER'
      and not exists (select 1 from public.pos_sale_items si where si.sale_id = d.sale_id)
    ) or (
      d.document_type = 'PURCHASE_FROM_CUSTOMER'
      and not exists (select 1 from public.pos_buy_items bi where bi.buy_id = d.buy_id)
    ) or (
      d.document_type = 'STOCK_RECEIPT'
      and not exists (select 1 from public.pos_purchase_items pi where pi.receipt_id = d.receipt_id)
    )
  ),
  paged as (
    select
      l.id,
      l.document_no as "documentNo",
      l.document_type as "documentType",
      l.issued_at as "issuedAt",
      l.party_name as "partyName",
      l.party_phone as "partyPhone",
      l.total_dong as "totalDong",
      l.paid_dong as "paidDong",
      l.remaining_dong as "remainingDong",
      l.payment_status as "paymentStatus",
      l.payment_method as "paymentMethod",
      l.ref_no as "refNo",
      l.product_name as "productName",
      l.quantity as "quantity",
      l.weight_chi as "weightChi",
      l.brand_name as "brandName",
      l.note as "note",
      l.pickup_due_at as "pickupDueAt",
      l.gold_delivered_at as "goldDeliveredAt",
      l.first_paid_dong as "firstPaidDong",
      l.second_paid_dong as "secondPaidDong",
      l.unit_price_dong as "unitPriceDong"
    from lines l
    order by l.issued_at desc, l.document_no, l.line_ord, l.product_name
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb),
    'total', (select total from counted),
    'exportedDocuments', (select count(*)::int from limited_docs),
    'limit', v_doc_limit,
    'offset', 0
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.pos_export_documents(text, text, date, date, text, integer)
  from public, anon;
grant execute on function public.pos_export_documents(text, text, date, date, text, integer)
  to authenticated;
