-- Buy voucher snapshots + brand on items. Ledger/document list & export RPCs.

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
as $$
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
    p_weight_chi, 1, 0, true, true, v_brand
  )
  returning id into v_id;

  insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
  values (v_id, 0, now())
  on conflict (sku_id) do nothing;

  return v_id;
end;
$$;

drop function if exists public.pos_complete_buy(text, uuid, text, jsonb, text, bigint, date, boolean, text);
drop function if exists pos_private.complete_buy(text, uuid, text, jsonb, text, bigint, date, boolean, text);

create function pos_private.complete_buy(
  p_idempotency_key text,
  p_customer_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_approve_price_exception boolean default false,
  p_price_exception_reason text default null,
  p_bank_account text default null,
  p_bank_account_holder text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_is_admin boolean;
  v_cached jsonb;
  v_customer public.pos_customers%rowtype;
  v_buy_id uuid;
  v_buy_no text;
  v_item record;
  v_sku_id uuid;
  v_total bigint := 0;
  v_line_total bigint;
  v_per_chi bigint;
  v_ref bigint;
  v_diff bigint;
  v_exception boolean;
  v_is_market boolean;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date := p_due_date;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_name text;
  v_brand_id uuid;
  v_brand_name text;
  v_cost_piece bigint;
  v_bank text;
  v_holder text;
begin
  v_actor := pos_private.require_pos_user();
  v_is_admin := public.tlkv_is_admin();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_buy');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_customer_id is null then
      raise exception 'Phải chọn khách hàng khi mua vào' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Danh sách hàng mua trống' using errcode = '22023';
    end if;

    select * into v_customer from public.pos_customers where id = p_customer_id for share;
    if not found then
      raise exception 'Khách hàng không tồn tại' using errcode = 'P0001';
    end if;
    if v_customer.is_walk_in then
      raise exception 'Không dùng khách lẻ cho giao dịch mua vào' using errcode = '22023';
    end if;

    v_bank := nullif(trim(coalesce(p_bank_account, v_customer.bank_account, '')), '');
    v_holder := nullif(trim(coalesce(p_bank_account_holder, v_customer.bank_account_holder, '')), '');

    for v_item in
      select *
      from jsonb_to_recordset(p_items) as x(
        sku_id uuid,
        is_market_gold boolean,
        product_name text,
        gold_type text,
        gold_age text,
        quantity integer,
        weight_chi numeric,
        unit_price_dong bigint,
        reference_price_dong_per_chi bigint,
        price_row_id text
      )
    loop
      if v_item.quantity is null or v_item.quantity <= 0 then
        raise exception 'Số lượng mua phải > 0' using errcode = '22023';
      end if;
      if v_item.weight_chi is null or v_item.weight_chi <= 0 then
        raise exception 'Trọng lượng phải > 0' using errcode = '22023';
      end if;
      if v_item.unit_price_dong is null or v_item.unit_price_dong < 0 then
        raise exception 'Giá mua không hợp lệ' using errcode = '22023';
      end if;

      v_is_market := coalesce(v_item.is_market_gold, false);
      v_per_chi := v_item.unit_price_dong;

      if not v_is_market then
        if v_item.sku_id is null then
          raise exception 'SKU bắt buộc với hàng catalog' using errcode = '22023';
        end if;
        v_ref := v_item.reference_price_dong_per_chi;
        if v_ref is null then
          raise exception 'Thiếu giá tham chiếu cho sản phẩm catalog' using errcode = '22023';
        end if;
        perform pos_private.assert_price_within_or_exception(
          v_per_chi, v_ref, p_approve_price_exception, v_is_admin, p_price_exception_reason
        );
      end if;

      v_line_total := (v_per_chi::numeric * v_item.weight_chi * v_item.quantity)::bigint;
      if v_line_total < 0 then
        raise exception 'Thành tiền dòng không hợp lệ' using errcode = '22023';
      end if;
      v_total := v_total + v_line_total;
    end loop;

    if p_paid_dong is null then
      v_paid := v_total;
    else
      v_paid := p_paid_dong;
    end if;
    if v_paid < 0 or v_paid > v_total then
      raise exception 'Số tiền đã trả không hợp lệ' using errcode = '22023';
    end if;
    v_remaining := v_total - v_paid;
    if v_remaining > 0 and v_due is null then
      raise exception 'Phải có ngày hẹn trả khi chưa trả đủ' using errcode = '22023';
    end if;
    if v_remaining = 0 then
      v_due := null;
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_total, v_due);

    v_buy_no := 'BUY-' || lpad(nextval('public.pos_buy_seq')::text, 6, '0');

    insert into public.pos_buys (
      buy_no, customer_id, status, payment_method,
      total_dong, paid_dong, remaining_dong, payment_status, due_date,
      note, idempotency_key, actor_email, completed_at, created_at,
      customer_name_snapshot, customer_phone_snapshot, customer_citizen_id_snapshot,
      customer_address_snapshot, customer_bank_account_snapshot, customer_bank_holder_snapshot
    ) values (
      v_buy_no, p_customer_id, 'COMPLETED', p_payment_method,
      v_total, v_paid, v_remaining, v_pay_status, v_due,
      v_note, trim(p_idempotency_key), v_actor, now(), now(),
      v_customer.name, v_customer.phone, v_customer.citizen_id,
      v_customer.address, v_bank, v_holder
    )
    returning id into v_buy_id;

    for v_item in
      select *
      from jsonb_to_recordset(p_items) as x(
        sku_id uuid,
        is_market_gold boolean,
        product_name text,
        gold_type text,
        gold_age text,
        quantity integer,
        weight_chi numeric,
        unit_price_dong bigint,
        reference_price_dong_per_chi bigint,
        price_row_id text
      )
    loop
      v_is_market := coalesce(v_item.is_market_gold, false);
      v_per_chi := v_item.unit_price_dong;
      v_line_total := (v_per_chi::numeric * v_item.weight_chi * v_item.quantity)::bigint;
      v_name := nullif(trim(coalesce(v_item.product_name, '')), '');
      v_cost_piece := (v_line_total::numeric / v_item.quantity)::bigint;

      if v_is_market then
        v_ref := null;
        v_diff := null;
        v_exception := false;
        v_sku_id := pos_private.ensure_market_gold_sku(
          v_name, v_item.gold_type, v_item.gold_age, v_item.weight_chi, v_item.price_row_id
        );
        if v_name is null then
          select name into v_name from public.pos_skus where id = v_sku_id;
        end if;
      else
        v_sku_id := v_item.sku_id;
        v_ref := v_item.reference_price_dong_per_chi;
        v_diff := v_per_chi - v_ref;
        v_exception := abs(v_diff) > 300000;
        select name into v_name from public.pos_skus where id = v_sku_id and is_active;
        if v_name is null then
          raise exception 'SKU không tồn tại hoặc đã ngừng' using errcode = 'P0001';
        end if;
        insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
        values (v_sku_id, 0, now())
        on conflict (sku_id) do nothing;
      end if;

      select s.brand_id, b.name
      into v_brand_id, v_brand_name
      from public.pos_skus s
      left join public.brands b on b.id = s.brand_id
      where s.id = v_sku_id;

      if v_brand_name is null and v_is_market then
        v_brand_name := 'Vàng thị trường';
      end if;

      insert into public.pos_buy_items (
        buy_id, sku_id, product_name_snapshot, gold_type, gold_age,
        quantity, weight_chi, unit_price_dong, total_price_dong,
        reference_price_dong_per_chi, price_row_id, is_market_gold,
        price_exception, difference_per_chi, brand_id, brand_name
      ) values (
        v_buy_id, v_sku_id, v_name, nullif(trim(coalesce(v_item.gold_type, '')), ''),
        nullif(trim(coalesce(v_item.gold_age, '')), ''),
        v_item.quantity, v_item.weight_chi, v_per_chi, v_line_total,
        v_ref, nullif(trim(coalesce(v_item.price_row_id, '')), ''),
        v_is_market,
        v_exception, v_diff, v_brand_id, v_brand_name
      );

      perform pos_private.apply_stock_change(
        v_sku_id,
        v_item.quantity,
        'PURCHASE_RECEIVED',
        'Mua vào từ khách ' || v_buy_no,
        'CUSTOMER_BUY',
        v_buy_id,
        v_actor,
        v_cost_piece,
        v_brand_name
      );

      if v_exception then
        insert into public.pos_price_exceptions (
          transaction_type, transaction_id, reference_price_dong_per_chi,
          actual_price_dong_per_chi, difference_per_chi, weight_chi,
          reason, created_by, approved_by, approved_at
        ) values (
          'BUY', v_buy_id, v_ref, v_per_chi, v_diff, v_item.weight_chi,
          nullif(trim(coalesce(p_price_exception_reason, '')), ''),
          v_actor, v_actor, now()
        );
      end if;
    end loop;

    if v_paid > 0 then
      insert into public.pos_buy_payments (
        buy_id, amount_dong, payment_method, paid_at, actor_email, note
      ) values (
        v_buy_id, v_paid, p_payment_method, now(), v_actor, 'Thanh toán lúc mua vào'
      );
    end if;

    perform pos_private.upsert_payable_for_buy(v_buy_id);

    insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_COMPLETE', 'buy', v_buy_id,
      'Hoàn tất mua vào ' || v_buy_no,
      jsonb_build_object(
        'buy_no', v_buy_no,
        'total_dong', v_total,
        'paid_dong', v_paid,
        'remaining_dong', v_remaining,
        'payment_status', v_pay_status
      )
    );

    v_result := jsonb_build_object(
      'buyId', v_buy_id,
      'buyNo', v_buy_no,
      'totalDong', v_total,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status,
      'dueDate', v_due,
      'customerId', p_customer_id
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception
    when others then
      perform pos_private.clear_pending_idempotency(p_idempotency_key);
      raise;
  end;
end;
$$;

create function public.pos_complete_buy(
  p_idempotency_key text,
  p_customer_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_approve_price_exception boolean default false,
  p_price_exception_reason text default null,
  p_bank_account text default null,
  p_bank_account_holder text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.complete_buy(
    p_idempotency_key, p_customer_id, p_payment_method, p_items,
    p_note, p_paid_dong, p_due_date, p_approve_price_exception, p_price_exception_reason,
    p_bank_account, p_bank_account_holder
  );
$$;

revoke all on function public.pos_complete_buy(text, uuid, text, jsonb, text, bigint, date, boolean, text, text, text)
  from public, anon;
grant execute on function public.pos_complete_buy(text, uuid, text, jsonb, text, bigint, date, boolean, text, text, text)
  to authenticated;

create or replace function public.pos_get_buy(p_buy_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buy jsonb;
  v_items jsonb;
  v_payments jsonb;
begin
  perform pos_private.require_pos_user();

  select jsonb_build_object(
    'id', b.id,
    'buyNo', b.buy_no,
    'customerId', b.customer_id,
    'customerName', coalesce(b.customer_name_snapshot, c.name),
    'customerPhone', coalesce(b.customer_phone_snapshot, c.phone),
    'customerNo', c.customer_no,
    'customerCitizenId', coalesce(b.customer_citizen_id_snapshot, c.citizen_id),
    'customerAddress', coalesce(b.customer_address_snapshot, c.address),
    'customerBankAccount', b.customer_bank_account_snapshot,
    'customerBankHolder', b.customer_bank_holder_snapshot,
    'totalDong', b.total_dong,
    'paidDong', b.paid_dong,
    'remainingDong', b.remaining_dong,
    'paymentStatus', b.payment_status,
    'paymentMethod', b.payment_method,
    'dueDate', b.due_date,
    'actorEmail', b.actor_email,
    'completedAt', b.completed_at,
    'note', b.note
  )
  into v_buy
  from public.pos_buys b
  join public.pos_customers c on c.id = b.customer_id
  where b.id = p_buy_id;

  if v_buy is null then
    raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'skuId', i.sku_id,
    'productName', i.product_name_snapshot,
    'goldType', i.gold_type,
    'goldAge', i.gold_age,
    'quantity', i.quantity,
    'weightChi', i.weight_chi,
    'unitPriceDong', i.unit_price_dong,
    'totalPriceDong', i.total_price_dong,
    'isMarketGold', i.is_market_gold,
    'priceException', i.price_exception,
    'brandId', i.brand_id,
    'brandName', i.brand_name
  ) order by i.id), '[]'::jsonb)
  into v_items
  from public.pos_buy_items i
  where i.buy_id = p_buy_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'amountDong', p.amount_dong,
    'paymentMethod', p.payment_method,
    'paidAt', p.paid_at,
    'actorEmail', p.actor_email,
    'note', p.note
  ) order by p.paid_at), '[]'::jsonb)
  into v_payments
  from public.pos_buy_payments p
  where p.buy_id = p_buy_id;

  return v_buy || jsonb_build_object('items', v_items, 'payments', v_payments);
end;
$$;
