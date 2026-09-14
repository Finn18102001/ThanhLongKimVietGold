-- 1) Soft-hide unused market/test SKUs from product catalogs (keep history FKs).
-- 2) Market buy SKUs created inactive so they never appear as product cards.
-- 3) DEPOSIT customer orders: invoice DH + sale_no PRE- (not HD/DC-).
-- Money/stock/fulfillment logic unchanged: DEPOSIT still no stock-out until delivery.

-- ---------------------------------------------------------------------------
-- A) Soft-deactivate market / test SKUs
-- ---------------------------------------------------------------------------
update public.pos_skus
set is_active = false
where is_active = true
  and (
    coalesce(is_market_gold, false) = true
    or name ilike '%thị trường%'
    or name ilike '%test%'
    or sku like 'MG-%'
  );

-- ---------------------------------------------------------------------------
-- B) ensure_market_gold_sku → always inactive (buy slip only; no product card)
-- ---------------------------------------------------------------------------
create or replace function pos_private.ensure_market_gold_sku(
  p_name text,
  p_gold_type text,
  p_gold_age text,
  p_weight_chi numeric,
  p_price_row_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sku_code text;
  v_id uuid;
  v_name text;
  v_brand uuid;
begin
  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := format(
      'Vàng thị trường %s %s %s chỉ',
      coalesce(nullif(trim(p_gold_type), ''), 'N/A'),
      coalesce(nullif(trim(p_gold_age), ''), ''),
      trim(to_char(p_weight_chi, 'FM999999990.####'))
    );
  end if;

  v_sku_code := 'MG-' || upper(substr(md5(
    coalesce(p_gold_type, '') || '|' || coalesce(p_gold_age, '') || '|' ||
    p_weight_chi::text || '|' || coalesce(p_price_row_id, '') || '|' || v_name
  ), 1, 12));

  select id into v_id from public.pos_skus where sku = v_sku_code;
  if v_id is not null then
    update public.pos_skus
    set is_active = false, is_market_gold = true
    where id = v_id and (is_active = true or coalesce(is_market_gold, false) = false);
    insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
    values (v_id, 0, now())
    on conflict (sku_id) do nothing;
    return v_id;
  end if;

  select id into v_brand from public.brands where slug = 'vang-thi-truong' limit 1;

  insert into public.pos_skus (
    sku, name, catalog_product_id, price_row_id,
    weight_chi, board_unit_chi, labor_fee_dong, is_active, is_market_gold, brand_id
  ) values (
    v_sku_code, v_name, null, nullif(trim(coalesce(p_price_row_id, '')), ''),
    p_weight_chi, 1, 0, false, true, v_brand
  )
  returning id into v_id;

  insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
  values (v_id, 0, now())
  on conflict (sku_id) do nothing;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- C) Backfill: DEPOSIT invoices HD****** → DH****** (same digits; no collisions)
-- ---------------------------------------------------------------------------
update public.pos_invoices i
set invoice_no = 'DH' || substr(i.invoice_no, 3)
from public.pos_sales s
where i.sale_id = s.id
  and s.transaction_type = 'DEPOSIT'
  and i.invoice_no like 'HD%'
  and not exists (
    select 1 from public.pos_invoices x where x.invoice_no = 'DH' || substr(i.invoice_no, 3)
  );

-- ---------------------------------------------------------------------------
-- D) Backfill: DEPOSIT sale_no DC-****** → new PRE-****** (avoid PRE collisions)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_next text;
begin
  for r in
    select id
    from public.pos_sales
    where transaction_type = 'DEPOSIT'
      and sale_no like 'DC-%'
    order by sale_no
  loop
    v_next := 'PRE-' || lpad(nextval('public.pos_preorder_seq')::text, 6, '0');
    update public.pos_sales set sale_no = v_next where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- E) complete_sale: DEPOSIT uses PRE- + DH (stock/money logic unchanged)
-- ---------------------------------------------------------------------------
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
      -- Customer deposit / partial / hold gold → đơn đặt hàng (DH + PRE-), not HD/DC-
      v_sale_no := 'PRE-' || lpad(nextval('public.pos_preorder_seq')::text, 6, '0');
      v_invoice_no := 'DH' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
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
