-- Cluster 1b part 2: complete_buy, collect_buy_payment, overdue, reporting RPCs,
-- sync receivable on sale payment, backfill open receivables.

-- ---------------------------------------------------------------------------
-- complete_buy
-- ---------------------------------------------------------------------------
create or replace function pos_private.complete_buy(
  p_idempotency_key text,
  p_customer_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_approve_price_exception boolean default false,
  p_price_exception_reason text default null
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
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date := p_due_date;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_name text;
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

    -- First pass: validate + sum
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

      v_per_chi := v_item.unit_price_dong;
      v_ref := coalesce(v_item.reference_price_dong_per_chi, v_per_chi);
      v_diff := pos_private.assert_price_within_or_exception(
        v_per_chi, v_ref, p_approve_price_exception, v_is_admin, p_price_exception_reason
      );

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
      note, idempotency_key, actor_email, completed_at, created_at
    ) values (
      v_buy_no, p_customer_id, 'COMPLETED', p_payment_method,
      v_total, v_paid, v_remaining, v_pay_status, v_due,
      v_note, trim(p_idempotency_key), v_actor, now(), now()
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
      v_per_chi := v_item.unit_price_dong;
      v_ref := coalesce(v_item.reference_price_dong_per_chi, v_per_chi);
      v_diff := v_per_chi - v_ref;
      v_exception := abs(v_diff) > 300000;
      v_line_total := (v_per_chi::numeric * v_item.weight_chi * v_item.quantity)::bigint;
      v_name := nullif(trim(coalesce(v_item.product_name, '')), '');

      if coalesce(v_item.is_market_gold, false) then
        v_sku_id := pos_private.ensure_market_gold_sku(
          v_name, v_item.gold_type, v_item.gold_age, v_item.weight_chi, v_item.price_row_id
        );
        if v_name is null then
          select name into v_name from public.pos_skus where id = v_sku_id;
        end if;
      else
        if v_item.sku_id is null then
          raise exception 'SKU bắt buộc với hàng catalog' using errcode = '22023';
        end if;
        v_sku_id := v_item.sku_id;
        select name into v_name from public.pos_skus where id = v_sku_id and is_active;
        if v_name is null then
          raise exception 'SKU không tồn tại hoặc đã ngừng' using errcode = 'P0001';
        end if;
        insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
        values (v_sku_id, 0, now())
        on conflict (sku_id) do nothing;
      end if;

      insert into public.pos_buy_items (
        buy_id, sku_id, product_name_snapshot, gold_type, gold_age,
        quantity, weight_chi, unit_price_dong, total_price_dong,
        reference_price_dong_per_chi, price_row_id, is_market_gold,
        price_exception, difference_per_chi
      ) values (
        v_buy_id, v_sku_id, v_name, nullif(trim(coalesce(v_item.gold_type, '')), ''),
        nullif(trim(coalesce(v_item.gold_age, '')), ''),
        v_item.quantity, v_item.weight_chi, v_per_chi, v_line_total,
        v_ref, nullif(trim(coalesce(v_item.price_row_id, '')), ''),
        coalesce(v_item.is_market_gold, false),
        v_exception, v_diff
      );

      perform pos_private.apply_stock_change(
        v_sku_id,
        v_item.quantity,
        'PURCHASE_RECEIVED',
        'Mua vào từ khách ' || v_buy_no,
        'CUSTOMER_BUY',
        v_buy_id,
        v_actor
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

create or replace function public.pos_complete_buy(
  p_idempotency_key text,
  p_customer_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_approve_price_exception boolean default false,
  p_price_exception_reason text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.complete_buy(
    p_idempotency_key, p_customer_id, p_payment_method, p_items,
    p_note, p_paid_dong, p_due_date, p_approve_price_exception, p_price_exception_reason
  );
$$;

revoke all on function public.pos_complete_buy(text, uuid, text, jsonb, text, bigint, date, boolean, text)
  from public, anon;
grant execute on function public.pos_complete_buy(text, uuid, text, jsonb, text, bigint, date, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- collect_buy_payment (trả nợ khách / giảm payable)
-- ---------------------------------------------------------------------------
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
set search_path = ''
as $$
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
begin
  v_actor := pos_private.require_pos_user();
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

    update public.pos_buys
    set
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due
    where id = p_buy_id;

    insert into public.pos_buy_payments (
      buy_id, amount_dong, payment_method, paid_at, actor_email, note, idempotency_key
    ) values (
      p_buy_id, p_amount_dong, p_payment_method, now(), v_actor, v_note, v_key
    );

    perform pos_private.upsert_payable_for_buy(p_buy_id);

    insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_PAYMENT_COLLECT', 'buy', p_buy_id,
      'Trả thêm cho khách trên ' || v_buy.buy_no,
      jsonb_build_object('amount_dong', p_amount_dong, 'remaining_dong', v_remaining)
    );

    v_result := jsonb_build_object(
      'buyId', p_buy_id,
      'buyNo', v_buy.buy_no,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status,
      'dueDate', v_due
    );
    return pos_private.finish_idempotency(v_key, v_result);
  exception
    when others then
      perform pos_private.clear_pending_idempotency(v_key);
      raise;
  end;
end;
$$;

create or replace function public.pos_collect_buy_payment(
  p_buy_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.collect_buy_payment(
    p_buy_id, p_amount_dong, p_payment_method, p_note, p_idempotency_key, p_due_date
  );
$$;

revoke all on function public.pos_collect_buy_payment(uuid, bigint, text, text, text, date)
  from public, anon;
grant execute on function public.pos_collect_buy_payment(uuid, bigint, text, text, text, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Overdue cron job body
-- ---------------------------------------------------------------------------
create or replace function public.pos_mark_overdue_debts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_sales int := 0;
  v_buys int := 0;
begin
  update public.pos_sales s
  set payment_status = 'OVERDUE'
  where s.remaining_dong > 0
    and s.due_date is not null
    and s.due_date < v_today
    and s.payment_status in ('UNPAID', 'PARTIALLY_PAID');
  get diagnostics v_sales = row_count;

  update public.pos_buys b
  set payment_status = 'OVERDUE'
  where b.remaining_dong > 0
    and b.due_date is not null
    and b.due_date < v_today
    and b.payment_status in ('UNPAID', 'PARTIALLY_PAID');
  get diagnostics v_buys = row_count;

  update public.pos_receivables r
  set status = 'OVERDUE', updated_at = now()
  where r.remaining_dong > 0
    and r.due_date is not null
    and r.due_date < v_today
    and r.status in ('OPEN', 'PARTIAL');

  update public.pos_payables p
  set status = 'OVERDUE', updated_at = now()
  where p.remaining_dong > 0
    and p.due_date is not null
    and p.due_date < v_today
    and p.status in ('OPEN', 'PARTIAL');

  return jsonb_build_object(
    'salesMarked', v_sales,
    'buysMarked', v_buys,
    'ranAt', now()
  );
end;
$$;

revoke all on function public.pos_mark_overdue_debts() from public, anon;
grant execute on function public.pos_mark_overdue_debts() to authenticated;

-- Schedule daily overdue if pg_cron available (ignore if not)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'pos_mark_overdue_debts_daily';

    perform cron.schedule(
      'pos_mark_overdue_debts_daily',
      '15 0 * * *',
      $cron$ select public.pos_mark_overdue_debts(); $cron$
    );
  end if;
exception
  when others then
    raise notice 'pg_cron schedule skipped: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Patch collect_sale_payment: sync receivable after collect
-- (redefine wrapper that calls upsert after private collect — patch private)
-- ---------------------------------------------------------------------------
create or replace function pos_private.collect_sale_payment(
  p_sale_id uuid,
  p_amount_dong bigint,
  p_payment_method text,
  p_note text default null,
  p_idempotency_key text default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_key text;
  v_sale public.pos_sales%rowtype;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
begin
  v_actor := pos_private.require_pos_user();
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'collect:' || p_sale_id::text || ':' || gen_random_uuid()::text;
  end if;

  v_cached := pos_private.begin_idempotency(v_key, 'collect_sale_payment');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_amount_dong is null or p_amount_dong <= 0 then
      raise exception 'Số tiền thu phải > 0' using errcode = '22023';
    end if;

    select * into v_sale from public.pos_sales where id = p_sale_id for update;
    if not found then
      raise exception 'Đơn bán không tồn tại' using errcode = 'P0001';
    end if;
    if v_sale.status <> 'COMPLETED' then
      raise exception 'Chỉ thu trên đơn đã hoàn tất' using errcode = 'P0001';
    end if;
    if v_sale.remaining_dong <= 0 then
      raise exception 'Hóa đơn đã thanh toán đủ' using errcode = 'P0001';
    end if;
    if p_amount_dong > v_sale.remaining_dong then
      raise exception 'Số tiền thu vượt số còn lại' using errcode = '22023';
    end if;

    v_paid := v_sale.paid_dong + p_amount_dong;
    v_remaining := v_sale.total_dong - v_paid;
    v_due := case when v_remaining = 0 then null else coalesce(p_due_date, v_sale.due_date) end;
    if v_remaining > 0 and v_due is null then
      raise exception 'Phải có ngày hẹn trả khi còn phải thu' using errcode = '22023';
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_sale.total_dong, v_due);

    update public.pos_sales
    set
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due
    where id = p_sale_id;

    insert into public.pos_sale_payments (
      sale_id, amount_dong, payment_method, paid_at, actor_email, note, idempotency_key
    ) values (
      p_sale_id, p_amount_dong, p_payment_method, now(), v_actor, v_note, v_key
    );

    perform pos_private.upsert_receivable_for_sale(p_sale_id);

    v_result := jsonb_build_object(
      'saleId', p_sale_id,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status,
      'dueDate', v_due
    );
    return pos_private.finish_idempotency(v_key, v_result);
  exception
    when others then
      perform pos_private.clear_pending_idempotency(v_key);
      raise;
  end;
end;
$$;

-- Backfill receivables for existing open sales
insert into public.pos_receivables (
  customer_id, sale_id, total_dong, paid_dong, remaining_dong,
  due_date, status, opened_at, closed_at, updated_at
)
select
  s.customer_id,
  s.id,
  s.total_dong,
  s.paid_dong,
  s.remaining_dong,
  s.due_date,
  pos_private.derive_debt_entity_status(s.paid_dong, s.total_dong, s.due_date),
  coalesce(s.completed_at, s.created_at),
  case when s.remaining_dong = 0 then coalesce(s.completed_at, now()) else null end,
  now()
from public.pos_sales s
where s.status = 'COMPLETED'
  and s.remaining_dong > 0
on conflict (sale_id) do nothing;

-- ---------------------------------------------------------------------------
-- List / report helpers
-- ---------------------------------------------------------------------------
create or replace function public.pos_list_market_gold_refs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pos_private.require_pos_user();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'brand', r.brand,
      'product', r.product,
      'purity', r.purity,
      'buyDong', r.buy,
      'sellDong', r.sell
    ) order by r.sort_order)
    from public.gold_price_rows r
    where upper(r.brand) like '%THỊ TRƯỜNG%'
       or upper(r.brand) like '%THI TRUONG%'
       or upper(r.product) like '%THỊ TRƯỜNG%'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_list_market_gold_refs() from public, anon;
grant execute on function public.pos_list_market_gold_refs() to authenticated;

create or replace function public.pos_list_buys(
  p_limit integer default 50,
  p_offset integer default 0,
  p_payment_status text default null,
  p_q text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  perform pos_private.require_pos_user();
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb)
    from (
      select
        b.id,
        b.buy_no as "buyNo",
        b.customer_id as "customerId",
        c.name as "customerName",
        c.phone as "customerPhone",
        b.total_dong as "totalDong",
        b.paid_dong as "paidDong",
        b.remaining_dong as "remainingDong",
        b.payment_status as "paymentStatus",
        b.payment_method as "paymentMethod",
        b.due_date as "dueDate",
        b.actor_email as "actorEmail",
        b.completed_at as "completedAt",
        b.note
      from public.pos_buys b
      join public.pos_customers c on c.id = b.customer_id
      where (p_payment_status is null or b.payment_status = p_payment_status)
        and (
          v_q is null
          or b.buy_no ilike '%' || v_q || '%'
          or c.name ilike '%' || v_q || '%'
          or c.phone ilike '%' || v_q || '%'
        )
      order by b.completed_at desc nulls last
      limit v_limit offset v_offset
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_list_buys(integer, integer, text, text) from public, anon;
grant execute on function public.pos_list_buys(integer, integer, text, text) to authenticated;

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
    'customerName', c.name,
    'customerPhone', c.phone,
    'customerNo', c.customer_no,
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
    'priceException', i.price_exception
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

revoke all on function public.pos_get_buy(uuid) from public, anon;
grant execute on function public.pos_get_buy(uuid) to authenticated;

create or replace function public.pos_customer_debt_summary(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pos_private.require_pos_user();
  return jsonb_build_object(
    'receivableDong', coalesce((
      select sum(remaining_dong) from public.pos_receivables
      where customer_id = p_customer_id and remaining_dong > 0
    ), 0),
    'payableDong', coalesce((
      select sum(remaining_dong) from public.pos_payables
      where customer_id = p_customer_id and remaining_dong > 0
    ), 0),
    'buyCount', coalesce((
      select count(*) from public.pos_buys
      where customer_id = p_customer_id and status = 'COMPLETED'
    ), 0),
    'saleCount', coalesce((
      select count(*) from public.pos_sales
      where customer_id = p_customer_id and status = 'COMPLETED'
    ), 0)
  );
end;
$$;

revoke all on function public.pos_customer_debt_summary(uuid) from public, anon;
grant execute on function public.pos_customer_debt_summary(uuid) to authenticated;

create or replace function public.pos_report_staff_sales(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pos_private.require_admin();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Khoảng ngày không hợp lệ' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'actorEmail', x.actor_email,
      'invoiceCount', x.invoice_count,
      'grossDong', x.gross_dong,
      'collectedDong', x.collected_dong,
      'remainingDong', x.remaining_dong
    ) order by x.collected_dong desc)
    from (
      select
        s.actor_email,
        count(*)::int as invoice_count,
        coalesce(sum(s.total_dong), 0)::bigint as gross_dong,
        coalesce(sum(s.paid_dong), 0)::bigint as collected_dong,
        coalesce(sum(s.remaining_dong), 0)::bigint as remaining_dong
      from public.pos_sales s
      where s.status = 'COMPLETED'
        and s.completed_at::date >= p_from
        and s.completed_at::date <= p_to
      group by s.actor_email
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_report_staff_sales(date, date) from public, anon;
grant execute on function public.pos_report_staff_sales(date, date) to authenticated;

create or replace function public.pos_export_transactions(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pos_private.require_admin();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Khoảng ngày không hợp lệ' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t."completedAt" desc)
    from (
      select
        'SELL'::text as "type",
        s.sale_no as "code",
        i.invoice_no as "invoiceNo",
        c.name as "customerName",
        c.phone as "customerPhone",
        s.total_dong as "totalDong",
        s.paid_dong as "paidDong",
        s.remaining_dong as "remainingDong",
        s.payment_status as "paymentStatus",
        s.payment_method as "paymentMethod",
        s.due_date as "dueDate",
        s.actor_email as "actorEmail",
        s.completed_at as "completedAt"
      from public.pos_sales s
      join public.pos_customers c on c.id = s.customer_id
      left join public.pos_invoices i on i.sale_id = s.id
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
        b.total_dong,
        b.paid_dong,
        b.remaining_dong,
        b.payment_status,
        b.payment_method,
        b.due_date,
        b.actor_email,
        b.completed_at
      from public.pos_buys b
      join public.pos_customers c on c.id = b.customer_id
      where b.status = 'COMPLETED'
        and b.completed_at::date >= p_from
        and b.completed_at::date <= p_to
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_export_transactions(date, date) from public, anon;
grant execute on function public.pos_export_transactions(date, date) to authenticated;

-- Sync receivable whenever sale payment fields change (covers complete_sale + collect)
create or replace function pos_private.trg_sync_receivable_from_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'COMPLETED' then
    perform pos_private.upsert_receivable_for_sale(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists pos_sales_sync_receivable on public.pos_sales;
create trigger pos_sales_sync_receivable
  after insert or update of paid_dong, remaining_dong, due_date, payment_status, status
  on public.pos_sales
  for each row
  execute function pos_private.trg_sync_receivable_from_sale();
