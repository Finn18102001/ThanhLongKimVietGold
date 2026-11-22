-- P10-03: Two-step confirm — Flag ON: F9 lưu HĐ+YC chưa trừ kho; QV xác nhận trả vàng sau QT.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'tlkv_backup_20261110') then
    create table if not exists tlkv_backup_20261110._routines_p10_03 (
      saved_at timestamptz not null default now(),
      schema_name text not null,
      proname text not null,
      definition text not null
    );
    insert into tlkv_backup_20261110._routines_p10_03 (schema_name, proname, definition)
    select 'pos_private', 'complete_sale', pg_get_functiondef('pos_private.complete_sale(text,text,text,text,jsonb,uuid,text,bigint,date,jsonb,uuid,timestamptz,jsonb)'::regprocedure);
  end if;
exception when others then
  raise notice 'P10-03 snapshot skipped: %', sqlerrm;
end $$;

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
  p_actor_email text default null
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
begin
  if v_kind not in ('THU', 'CHI') then raise exception 'EMP_CASH_YC_KIND_INVALID'; end if;
  if p_amount_dong is null or p_amount_dong <= 0 then raise exception 'EMP_CASH_YC_AMOUNT_INVALID'; end if;
  if v_source not in ('sale', 'buy') then raise exception 'EMP_CASH_YC_SOURCE_INVALID'; end if;
  if p_source_id is null then raise exception 'EMP_CASH_YC_SOURCE_REQUIRED'; end if;
  if v_method not in ('CASH', 'TRANSFER', 'CARD', 'MIXED') then
    v_method := 'CASH';
  end if;
  v_content := nullif(trim(coalesce(p_content, '')), '');
  if v_content is null then
    v_content := case when v_kind = 'THU' then 'Yêu cầu thu tiền từ hóa đơn' else 'Yêu cầu chi tiền theo phiếu mua' end;
  end if;

  -- Không tạo YC trùng PENDING cùng nguồn + số tiền (tránh double F9)
  select id, code into v_id, v_code
  from public.pos_employee_cash_requests
  where source_type = v_source
    and source_id = p_source_id
    and amount_dong = p_amount_dong
    and payment_method = v_method
    and status = 'PENDING'
  limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'alreadyExists', true);
  end if;

  v_code := pos_private.employee_cash_request_next_code(v_kind);
  insert into public.pos_employee_cash_requests (
    code, kind, status, amount_dong, payment_method, content, note,
    source_type, source_id, source_code,
    customer_id, customer_name, customer_cccd,
    related_gold_account_id, related_staff_id, related_staff_name,
    requested_by_email, lines_json
  ) values (
    v_code, v_kind, 'PENDING', p_amount_dong, v_method, v_content,
    nullif(trim(coalesce(p_note, '')), ''),
    v_source, p_source_id, nullif(trim(coalesce(p_source_code, '')), ''),
    p_customer_id, nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_cccd, '')), ''),
    p_related_gold_account_id, p_related_staff_id,
    nullif(trim(coalesce(p_related_staff_name, '')), ''),
    v_actor, coalesce(p_lines, '[]'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'alreadyExists', false);
end;
$$;

create or replace function pos_private.complete_sale(p_idempotency_key text, p_customer_name text, p_customer_phone text, p_payment_method text, p_items jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_paid_dong bigint DEFAULT NULL::bigint, p_due_date date DEFAULT NULL::date, p_charges jsonb DEFAULT '[]'::jsonb, p_operator_staff_id uuid DEFAULT NULL::uuid, p_pickup_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_payment_splits jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_gold record;
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
  v_gold_unit bigint;
  v_stone_default bigint;
  v_stone_unit bigint;
  v_stone_qty integer;
  v_stone_unit_price bigint;
  v_labor_base bigint;
  v_labor_adj bigint;
  v_labor_final bigint;
  v_actual_unit bigint;
  v_line_total bigint;
  v_line_edits jsonb := '[]'::jsonb;
  v_today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_pickup timestamptz := p_pickup_due_at;
  v_charge_name text;
  v_deposit_wf text := null;
  v_avail integer;
  v_item_status text;
  v_split record;
  v_split_sum bigint := 0;
  v_sale_method text := p_payment_method;
  v_fund_on boolean := false;
  v_fund_codes text[] := array[]::text[];
  v_cust_name text;
  v_cust_cccd text;
  v_staff_name text;
  v_related_gold uuid;
  v_yc_lines jsonb;
  v_yc jsonb;
  v_yc_note text;
  v_gold_stock integer;
  v_sale_item_id uuid;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_sale');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    v_operator := pos_private.resolve_operator_staff_id(p_operator_staff_id);
    v_fund_on := pos_private.employee_fund_flag_on();

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
      select * from jsonb_to_recordset(p_items) as x(
        sku_id uuid,
        quantity integer,
        price_adjustment_per_chi bigint,
        stone_price_dong bigint,
        labor_adjust_dong bigint,
        stone_quantity integer,
        stone_unit_price_dong bigint
      )
    loop
      v_sku := pos_private.require_saleable_sku(v_item.sku_id);
      if v_sku.weight_chi is null or v_sku.weight_chi <= 0 then
        raise exception 'Trọng lượng sản phẩm không hợp lệ' using errcode = '22023';
      end if;

      select * into v_gold from pos_private.compute_gold_unit(v_sku);
      v_adj := coalesce(v_item.price_adjustment_per_chi, 0);

      if not coalesce(v_sku.is_market_gold, false) then
        perform pos_private.assert_price_within_or_exception(
          round(v_gold.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint + v_adj,
          round(v_gold.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint,
          false, false, null
        );
      end if;

      v_gold_unit := v_gold.gold_unit_dong + round(v_adj * v_sku.weight_chi)::bigint;
      if v_gold_unit < 0 then
        raise exception 'Giá giao dịch không hợp lệ' using errcode = '22023';
      end if;

      v_stone_default := coalesce(v_sku.stone_price_dong, 0);
      if v_item.stone_quantity is not null or v_item.stone_unit_price_dong is not null then
        -- BC-3: tiền đá / chiếc = đơn giá đá × số lượng đá. Thiếu vế nào thì lấy mặc định của SKU.
        v_stone_qty := coalesce(v_item.stone_quantity, v_sku.stone_quantity, 0);
        v_stone_unit_price := coalesce(v_item.stone_unit_price_dong, v_sku.stone_unit_price_dong, 0);
        if v_stone_qty < 0 then
          raise exception 'Số lượng đá không hợp lệ' using errcode = '22023';
        end if;
        if v_stone_unit_price < 0 then
          raise exception 'Đơn giá đá không hợp lệ' using errcode = '22023';
        end if;
        v_stone_unit := v_stone_unit_price * v_stone_qty;
      elsif v_item.stone_price_dong is not null and v_item.stone_price_dong <> v_stone_default then
        -- Client cũ sửa tay tiền đá / chiếc: không có số lượng, đơn giá.
        v_stone_qty := 0;
        v_stone_unit_price := 0;
        v_stone_unit := v_item.stone_price_dong;
      else
        v_stone_qty := coalesce(v_sku.stone_quantity, 0);
        v_stone_unit_price := coalesce(v_sku.stone_unit_price_dong, 0);
        v_stone_unit := v_stone_default;
      end if;
      if v_stone_unit < 0 then
        raise exception 'Giá đá không hợp lệ' using errcode = '22023';
      end if;

      v_labor_base := coalesce(v_sku.labor_fee_dong, 0);
      v_labor_adj := coalesce(v_item.labor_adjust_dong, 0);
      v_labor_final := v_labor_base + v_labor_adj;
      if v_labor_final < 0 then
        raise exception 'Tiền công sau điều chỉnh không được nhỏ hơn 0 (%)', v_sku.sku using errcode = '22023';
      end if;

      v_actual_unit := v_gold_unit + v_stone_unit + v_labor_final;
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
        qty_available_at_order, qty_delivered, item_status,
        gold_amount_dong, stone_weight_chi, stone_price_dong, stone_price_default_dong,
        labor_adjust_dong, labor_final_dong,
        stone_quantity, stone_unit_price_dong
      ) values (
        v_sale_id, v_sku.id, v_item.quantity, v_actual_unit, v_line_total,
        v_gold.gold_sell_dong, v_sku.weight_chi, v_sku.board_unit_chi,
        v_labor_base, coalesce(v_gold.price_row_id, v_sku.price_row_id, ''),
        v_sku.name, v_sku.sku, v_gold.gold_unit_dong + v_stone_default + v_labor_base, v_adj,
        v_avail, 0, v_item_status,
        v_gold_unit, coalesce(v_sku.stone_weight_chi, 0), v_stone_unit, v_stone_default,
        v_labor_adj, v_labor_final,
        v_stone_qty, v_stone_unit_price
      );

      if v_adj <> 0 then
        insert into public.pos_price_exceptions (
          transaction_type, transaction_id, line_id,
          reference_price_dong_per_chi, actual_price_dong_per_chi,
          difference_per_chi, weight_chi, reason, created_by
        )
        select
          'SALE', v_sale_id, si.id,
          round(v_gold.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint,
          round(v_gold.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint + v_adj,
          v_adj, v_sku.weight_chi,
          'Điều chỉnh giá POS ±300.000đ/chỉ', v_actor
        from public.pos_sale_items si
        where si.sale_id = v_sale_id and si.sku_id = v_sku.id
        order by si.id desc
        limit 1;
      end if;

      if v_stone_unit <> v_stone_default or v_labor_adj <> 0
         or v_stone_qty <> coalesce(v_sku.stone_quantity, 0)
         or v_stone_unit_price <> coalesce(v_sku.stone_unit_price_dong, 0) then
        v_line_edits := v_line_edits || jsonb_build_array(jsonb_build_object(
          'sku', v_sku.sku,
          'stone_price_default_dong', v_stone_default,
          'stone_price_dong', v_stone_unit,
          'stone_quantity_default', coalesce(v_sku.stone_quantity, 0),
          'stone_quantity', v_stone_qty,
          'stone_unit_price_default_dong', coalesce(v_sku.stone_unit_price_dong, 0),
          'stone_unit_price_dong', v_stone_unit_price,
          'labor_fee_dong', v_labor_base,
          'labor_adjust_dong', v_labor_adj,
          'labor_final_dong', v_labor_final
        ));
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
      v_sale_no := 'PRE-' || lpad(nextval('public.pos_preorder_seq')::text, 6, '0');
      v_invoice_no := 'DH' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
    elsif v_tx_type = 'PREORDER' and v_remaining > 0 then
      v_deposit_wf := 'AWAITING_AGREEMENT';
    elsif v_tx_type = 'SALE' then
      v_pickup := null;
    end if;

    -- P10-03: Flag ON + bán ngay → lưu đơn chờ QT/QV; chưa giao vàng
    if v_fund_on and v_tx_type = 'SALE' then
      v_fulfill := 'UNFULFILLED';
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
      if v_fund_on then
        select c.name, c.citizen_id into v_cust_name, v_cust_cccd
        from public.pos_customers c where c.id = v_customer_id;
        if v_operator is not null then
          select s.full_name into v_staff_name from public.pos_staff s where s.id = v_operator;
          select a.id into v_related_gold
          from public.pos_employee_gold_accounts a
          where a.kind = 'STAFF' and a.staff_id = v_operator and a.is_active
          limit 1;
        end if;
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', coalesce(si.product_name_snapshot, si.sku_snapshot, 'Hàng'),
          'purity', null,
          'unit', 'chiếc',
          'weight', si.weight_chi,
          'unitPriceDong', si.unit_price_dong,
          'amountDong', si.total_price_dong
        ) order by si.id), '[]'::jsonb)
        into v_yc_lines
        from public.pos_sale_items si where si.sale_id = v_sale_id;
        v_yc_note := case when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán' else 'Thanh toán lúc bán' end;
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
            v_yc := pos_private.employee_cash_request_create(
              'THU', v_split.amount_dong, v_split.method,
              'Thu tiền hóa đơn ' || v_invoice_no,
              'sale', v_sale_id, v_invoice_no,
              v_customer_id, v_cust_name, v_cust_cccd,
              v_operator, v_staff_name, v_related_gold,
              v_yc_note, v_yc_lines, v_actor
            );
            if v_yc->>'code' is not null then
              v_fund_codes := array_append(v_fund_codes, v_yc->>'code');
            end if;
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
          update public.pos_sales set payment_method = v_sale_method where id = v_sale_id;
        else
          if p_payment_method = 'MIXED' then
            raise exception 'Thanh toán hỗn hợp cần tách số tiền từng hình thức' using errcode = '22023';
          end if;
          v_yc := pos_private.employee_cash_request_create(
            'THU', v_paid, p_payment_method,
            'Thu tiền hóa đơn ' || v_invoice_no,
            'sale', v_sale_id, v_invoice_no,
            v_customer_id, v_cust_name, v_cust_cccd,
            v_operator, v_staff_name, v_related_gold,
            v_yc_note, v_yc_lines, v_actor
          );
          if v_yc->>'code' is not null then
            v_fund_codes := array_append(v_fund_codes, v_yc->>'code');
          end if;
        end if;
      else
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
              case when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán' else 'Thanh toán lúc bán' end,
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
          update public.pos_sales set payment_method = v_sale_method where id = v_sale_id;
        else
          if p_payment_method = 'MIXED' then
            raise exception 'Thanh toán hỗn hợp cần tách số tiền từng hình thức' using errcode = '22023';
          end if;
          insert into public.pos_sale_payments (
            sale_id, amount_dong, payment_method, paid_at, actor_email, note,
            idempotency_key, received_by_staff_id
          ) values (
            v_sale_id, v_paid, p_payment_method, now(), v_actor,
            case when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán' else 'Thanh toán lúc bán' end,
            'sale-open:' || trim(p_idempotency_key),
            v_operator
          );
        end if;
      end if;
    end if;

    if v_tx_type = 'SALE' then
      if v_fund_on then
        -- P10-03: chưa trừ kho / custody; chờ QT confirm rồi QV xác nhận trả vàng
        update public.pos_sale_items
        set qty_delivered = 0
        where sale_id = v_sale_id;
        perform pos_private.sync_sale_fulfillment_header(v_sale_id);
      else
        if v_operator is not null then
          select a.id into v_related_gold
          from public.pos_employee_gold_accounts a
          where a.kind = 'STAFF' and a.staff_id = v_operator and a.is_active
          limit 1;
        end if;
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
      end if;
    else
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
        'login_account', v_actor,
        'line_edits', v_line_edits
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
      'operator_staff_id', v_operator,
      'fund_request_codes', case when coalesce(array_length(v_fund_codes, 1), 0) > 0 then to_jsonb(v_fund_codes) else '[]'::jsonb end
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

create or replace function pos_private.collect_sale_payment(
  p_sale_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null,
  p_operator_staff_id uuid default null
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
  v_sale public.pos_sales%rowtype;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date;
  v_payment_id uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_receiver uuid;
  v_fund_on boolean := false;
  v_fund_codes text[] := array[]::text[];
  v_inv_no text;
  v_cust_name text;
  v_cust_cccd text;
  v_staff_name text;
  v_related_gold uuid;
  v_yc_lines jsonb;
  v_yc jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_receiver := pos_private.resolve_operator_staff_id(p_operator_staff_id);
  v_fund_on := pos_private.employee_fund_flag_on();
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then v_key := 'collect:' || p_sale_id::text || ':' || gen_random_uuid()::text; end if;
  v_cached := pos_private.begin_idempotency(v_key, 'collect_sale_payment');
  if v_cached is not null then return v_cached; end if;
  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023'; end if;
    if p_amount_dong is null or p_amount_dong <= 0 then raise exception 'Số tiền thu phải > 0' using errcode = '22023'; end if;
    select * into v_sale from public.pos_sales where id = p_sale_id for update;
    if v_sale.id is null then raise exception 'Không tìm thấy đơn bán' using errcode = 'P0002'; end if;
    if v_sale.status <> 'COMPLETED' then raise exception 'Chỉ thu tiền trên đơn đã hoàn tất' using errcode = '22023'; end if;
    if v_sale.fulfillment_status = 'CANCELLED' then raise exception 'Đơn đã hủy, không thu thêm' using errcode = '22023'; end if;
    if coalesce(v_sale.remaining_dong, 0) <= 0 then raise exception 'Đơn đã thanh toán đủ' using errcode = '22023'; end if;
    if p_amount_dong > v_sale.remaining_dong then raise exception 'Số tiền thu vượt số còn lại (% đ)', v_sale.remaining_dong using errcode = '22023'; end if;
    v_paid := v_sale.paid_dong + p_amount_dong;
    v_remaining := v_sale.total_dong - v_paid;
    v_due := case when v_remaining = 0 then null else coalesce(p_due_date, v_sale.due_date) end;
    if v_remaining > 0 and v_due is null then raise exception 'Đơn còn nợ phải có ngày hẹn trả' using errcode = '22023'; end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_sale.total_dong, v_due);

    if v_fund_on then
      select invoice_no into v_inv_no from public.pos_invoices where sale_id = p_sale_id order by issued_at desc limit 1;
      if v_sale.customer_id is not null then
        select c.name, c.citizen_id into v_cust_name, v_cust_cccd from public.pos_customers c where c.id = v_sale.customer_id;
      end if;
      if v_receiver is not null then
        select s.full_name into v_staff_name from public.pos_staff s where s.id = v_receiver;
        select a.id into v_related_gold from public.pos_employee_gold_accounts a
        where a.kind = 'STAFF' and a.staff_id = v_receiver and a.is_active limit 1;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', coalesce(si.product_name_snapshot, si.sku_snapshot, 'Hàng'),
        'purity', null,
        'unit', 'chiếc',
        'weight', si.weight_chi,
        'unitPriceDong', si.unit_price_dong,
        'amountDong', si.total_price_dong
      ) order by si.id), '[]'::jsonb)
      into v_yc_lines from public.pos_sale_items si where si.sale_id = p_sale_id;
      v_yc := pos_private.employee_cash_request_create(
        'THU', p_amount_dong, p_payment_method,
        'Thu tiền hóa đơn ' || coalesce(v_inv_no, v_sale.sale_no),
        'sale', p_sale_id, coalesce(v_inv_no, v_sale.sale_no),
        v_sale.customer_id, v_cust_name, v_cust_cccd,
        v_receiver, v_staff_name, v_related_gold,
        v_note, v_yc_lines, v_actor
      );
      if v_yc->>'code' is not null then
        v_fund_codes := array_append(v_fund_codes, v_yc->>'code');
      end if;
    else
      insert into public.pos_sale_payments (sale_id, amount_dong, payment_method, paid_at, actor_email, note, idempotency_key, received_by_staff_id)
      values (v_sale.id, p_amount_dong, p_payment_method, now(), v_actor, v_note, v_key, v_receiver) returning id into v_payment_id;
    end if;

    update public.pos_sales set paid_dong = v_paid, remaining_dong = v_remaining, payment_status = v_pay_status, due_date = v_due where id = v_sale.id;
    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (v_actor, 'PAYMENT_COLLECT', 'sale', v_sale.id, 'Thu tiền còn lại',
      jsonb_build_object('sale_no', v_sale.sale_no, 'payment_id', v_payment_id, 'amount_dong', p_amount_dong, 'paid_dong', v_paid,
        'remaining_dong', v_remaining, 'payment_status', v_pay_status, 'due_date', v_due, 'received_by_staff_id', v_receiver,
        'sale_operator_staff_id', v_sale.operator_staff_id, 'fund_request_codes', to_jsonb(v_fund_codes)));
    v_result := jsonb_build_object('ok', true, 'sale_id', v_sale.id, 'sale_no', v_sale.sale_no, 'payment_id', v_payment_id, 'amount_dong', p_amount_dong,
      'paid_dong', v_paid, 'remaining_dong', v_remaining, 'payment_status', v_pay_status, 'due_date', v_due, 'received_by_staff_id', v_receiver,
      'fund_request_codes', case when coalesce(array_length(v_fund_codes, 1), 0) > 0 then to_jsonb(v_fund_codes) else '[]'::jsonb end);
    return pos_private.finish_idempotency(v_key, v_result);
  exception when others then perform pos_private.clear_pending_idempotency(v_key); raise;
  end;
end;
$function$;

-- P10-03: Qu? v�ng x�c nh?n tr? v�ng (sau khi m?i YC-THU c?a sale d� CONFIRMED)
create or replace function pos_private.employee_sale_confirm_gold(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor text;
  v_sale public.pos_sales%rowtype;
  v_inv_no text;
  v_operator uuid;
  v_related_gold uuid;
  v_pending int;
  v_confirmed int;
  v_item record;
  v_gold_stock integer;
  v_is_admin boolean;
  v_my_gold uuid;
begin
  v_actor := pos_private.require_pos_user();
  if not pos_private.employee_fund_flag_on() then
    raise exception 'EMP_FUND_FLAG_OFF' using errcode = '22023';
  end if;

  select * into v_sale from public.pos_sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception 'Kh�ng t�m th?y don b�n' using errcode = 'P0002';
  end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'Ch? x�c nh?n tr? v�ng tr�n don d� luu' using errcode = '22023';
  end if;
  if v_sale.fulfillment_status = 'DELIVERED' then
    select invoice_no into v_inv_no from public.pos_invoices where sale_id = p_sale_id order by issued_at desc limit 1;
    return jsonb_build_object('ok', true, 'alreadyConfirmed', true, 'saleId', p_sale_id, 'invoiceNo', v_inv_no);
  end if;
  if v_sale.fulfillment_status = 'CANCELLED' then
    raise exception '�on d� h?y' using errcode = '22023';
  end if;
  if v_sale.transaction_type <> 'SALE' then
    raise exception 'X�c nh?n tr? v�ng P10-03 hi?n ch? �p d?ng b�n ngay (SALE)' using errcode = '22023';
  end if;

  v_is_admin := public.tlkv_is_admin();
  v_my_gold := null;
  begin
    select a.id into v_my_gold
    from public.pos_employee_gold_accounts a
    join public.pos_staff s on s.id = a.staff_id
    where a.kind = 'STAFF' and a.is_active
      and lower(s.email) = lower(v_actor)
    limit 1;
  exception when others then
    v_my_gold := null;
  end;
  if not v_is_admin and v_my_gold is null then
    raise exception 'Ch? Qu? v�ng ho?c Admin du?c x�c nh?n tr? v�ng' using errcode = '42501';
  end if;

  select count(*)::int into v_pending
  from public.pos_employee_cash_requests r
  where r.source_type = 'sale' and r.source_id = p_sale_id and r.kind = 'THU' and r.status = 'PENDING';
  if v_pending > 0 then
    raise exception 'Qu? ti?n chua x�c nh?n d? kho?n thu (c�n % YC ch?)', v_pending using errcode = '22023';
  end if;

  select count(*)::int into v_confirmed
  from public.pos_employee_cash_requests r
  where r.source_type = 'sale' and r.source_id = p_sale_id and r.kind = 'THU' and r.status = 'CONFIRMED';
  if v_confirmed < 1 and coalesce(v_sale.paid_dong, 0) > 0 then
    raise exception 'Chua c� YC thu d� x�c nh?n t? Qu? ti?n' using errcode = '22023';
  end if;

  select invoice_no into v_inv_no from public.pos_invoices where sale_id = p_sale_id order by issued_at desc limit 1;
  v_operator := v_sale.operator_staff_id;
  if v_operator is not null then
    select a.id into v_related_gold
    from public.pos_employee_gold_accounts a
    where a.kind = 'STAFF' and a.staff_id = v_operator and a.is_active
    limit 1;
  end if;

  perform s.sku_id
  from public.pos_inventory_stock s
  where s.sku_id in (select si.sku_id from public.pos_sale_items si where si.sale_id = p_sale_id)
  order by s.sku_id
  for update;

  for v_item in
    select si.id as sale_item_id, si.sku_id, si.quantity
    from public.pos_sale_items si
    where si.sale_id = p_sale_id
    order by si.id
  loop
    perform pos_private.apply_stock_change(
      v_item.sku_id, - v_item.quantity,
      'SALE', 'B�n h�ng (x�c nh?n tr? v�ng)', 'SALE', p_sale_id, v_actor
    );
    if v_related_gold is not null then
      select coalesce(gs.quantity, 0) into v_gold_stock
      from public.pos_employee_gold_stock gs
      where gs.account_id = v_related_gold and gs.sku_id = v_item.sku_id;
      if coalesce(v_gold_stock, 0) >= v_item.quantity then
        begin
          perform pos_private.employee_gold_post(
            v_related_gold, v_item.sku_id, 'SALE_CUSTODY', 'OUT', v_item.quantity,
            'Tr? v�ng ' || coalesce(v_inv_no, v_sale.sale_no),
            v_actor, now(), null,
            'sale', p_sale_id, coalesce(v_inv_no, v_sale.sale_no),
            'pos_sale_items', v_item.sale_item_id, null
          );
        exception when others then
          raise notice 'EMP_FUND_GOLD_CONFIRM_SOFT: sale=% sku=% err=%', p_sale_id, v_item.sku_id, sqlerrm;
        end;
      end if;
    end if;
  end loop;

  update public.pos_sale_items
  set qty_delivered = quantity, item_status = 'DELIVERED'
  where sale_id = p_sale_id;

  update public.pos_sales
  set fulfillment_status = 'DELIVERED'
  where id = p_sale_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'FUND_GOLD_CONFIRM', 'sale', p_sale_id, 'Qu? v�ng x�c nh?n tr? v�ng',
    jsonb_build_object('sale_no', v_sale.sale_no, 'invoice_no', v_inv_no, 'operator_staff_id', v_operator)
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyConfirmed', false,
    'saleId', p_sale_id,
    'saleNo', v_sale.sale_no,
    'invoiceNo', v_inv_no,
    'fulfillmentStatus', 'DELIVERED'
  );
end;
$function$;

create or replace function public.pos_employee_sale_confirm_gold(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return pos_private.employee_sale_confirm_gold(p_sale_id);
end;
$function$;

create or replace function public.pos_employee_sale_list_awaiting_gold(
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
set row_security = off
as $function$
declare
  v_is_admin boolean := public.tlkv_is_admin();
  v_email text := public.tlkv_current_email();
  v_staff_id uuid;
  v_total integer;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if not pos_private.employee_fund_flag_on() then
    return jsonb_build_object('items', '[]'::jsonb, 'total', 0);
  end if;

  select s.id into v_staff_id from public.pos_staff s where lower(s.email) = lower(v_email) limit 1;

  select count(*)::int into v_total
  from public.pos_sales s
  where s.status = 'COMPLETED'
    and s.transaction_type = 'SALE'
    and s.fulfillment_status = 'UNFULFILLED'
    and (
      v_is_admin
      or s.operator_staff_id = v_staff_id
      or exists (
        select 1 from public.pos_invoices inv
        where inv.sale_id = s.id and lower(inv.actor_email) = lower(v_email)
      )
    );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      s.id as "saleId",
      s.sale_no as "saleNo",
      i.invoice_no as "invoiceNo",
      s.total_dong as "totalDong",
      s.paid_dong as "paidDong",
      s.payment_status as "paymentStatus",
      s.fulfillment_status as "fulfillmentStatus",
      s.created_at as "createdAt",
      c.name as "customerName",
      (
        select count(*)::int from public.pos_employee_cash_requests r
        where r.source_type = 'sale' and r.source_id = s.id and r.kind = 'THU' and r.status = 'PENDING'
      ) as "pendingYcCount",
      (
        select count(*)::int from public.pos_employee_cash_requests r
        where r.source_type = 'sale' and r.source_id = s.id and r.kind = 'THU' and r.status = 'CONFIRMED'
      ) as "confirmedYcCount",
      (
        select count(*)::int from public.pos_employee_cash_requests r
        where r.source_type = 'sale' and r.source_id = s.id and r.kind = 'THU' and r.status = 'PENDING'
      ) = 0
      and (
        select count(*)::int from public.pos_employee_cash_requests r
        where r.source_type = 'sale' and r.source_id = s.id and r.kind = 'THU' and r.status = 'CONFIRMED'
      ) > 0 as "canConfirmGold"
    from public.pos_sales s
    left join lateral (
      select invoice_no from public.pos_invoices where sale_id = s.id order by issued_at desc limit 1
    ) i on true
    left join public.pos_customers c on c.id = s.customer_id
    where s.status = 'COMPLETED'
      and s.transaction_type = 'SALE'
      and s.fulfillment_status = 'UNFULFILLED'
      and (
        v_is_admin
        or s.operator_staff_id = v_staff_id
        or exists (
          select 1 from public.pos_invoices inv
          where inv.sale_id = s.id and lower(inv.actor_email) = lower(v_email)
        )
      )
    order by s.created_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$function$;

revoke all on function public.pos_employee_sale_confirm_gold(uuid) from public, anon;
revoke all on function public.pos_employee_sale_list_awaiting_gold(integer, integer) from public, anon;
grant execute on function public.pos_employee_sale_confirm_gold(uuid) to authenticated, service_role;
grant execute on function public.pos_employee_sale_list_awaiting_gold(integer, integer) to authenticated, service_role;
