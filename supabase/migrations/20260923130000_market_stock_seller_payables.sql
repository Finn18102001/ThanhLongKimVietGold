-- Market gold: one inactive SKU per buy line, no admin price row.
-- Report Excel seller: operator staff name when the sale recorded one.
-- Cashflow "Phải trả": customer-buy payables plus received stock receipts still unpaid.

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
  -- p_price_row_id is ignored. Market gold is priced on the buy line, not /admin.
  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := format(
      'Vàng thị trường %s %s %s chỉ',
      coalesce(nullif(trim(p_gold_type), ''), 'N/A'),
      coalesce(nullif(trim(p_gold_age), ''), ''),
      trim(to_char(p_weight_chi, 'FM999999990.####'))
    );
  end if;

  -- New product for this buy line. Do not reuse an older market SKU.
  v_sku_code := 'MG-' || upper(substr(md5(clock_timestamp()::text || random()::text), 1, 12));

  select id into v_brand from public.brands where slug = 'vang-thi-truong' limit 1;

  insert into public.pos_skus (
    sku, name, catalog_product_id, price_row_id,
    weight_chi, board_unit_chi, labor_fee_dong, is_active, is_market_gold, brand_id
  ) values (
    v_sku_code, v_name, null, null,
    p_weight_chi, 1, 0, false, true, v_brand
  )
  returning id into v_id;

  insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
  values (v_id, 0, now())
  on conflict (sku_id) do nothing;

  return v_id;
end;
$function$;

create or replace function public.pos_export_transactions(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
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
        coalesce(nullif(trim(c.citizen_id), ''), '') as "customerCccd",
        si.total_price_dong as "totalDong",
        s.paid_dong as "paidDong",
        s.remaining_dong as "remainingDong",
        s.payment_status as "paymentStatus",
        s.payment_method as "paymentMethod",
        s.due_date as "dueDate",
        coalesce(
          (
            select nullif(trim(st.full_name), '')
            from public.pos_staff st
            where st.id = s.operator_staff_id
          ),
          s.actor_email
        ) as "actorEmail",
        s.completed_at as "completedAt",
        si.quantity::bigint as "quantitySold",
        (si.quantity * si.weight_chi)::numeric as "weightChiSold",
        coalesce(nullif(trim(si.sku_snapshot), ''), sk.sku, '') as "sku",
        coalesce(nullif(trim(br.name), ''), '') as "brandName",
        coalesce(nullif(trim(si.product_name_snapshot), ''), sk.name, '') as "productName",
        coalesce(s.note, '') as "note",
        case
          when coalesce(si.weight_chi, 0) > 0
            then round(si.unit_price_dong::numeric / si.weight_chi)::bigint
          else si.unit_price_dong
        end as "unitPriceDong",
        case
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'FULFILLED'
            then 'Đã trả vàng'
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'CANCELLED'
            then 'Đã hủy'
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'READY'
            then 'Sẵn sàng giao'
          when s.transaction_type in ('PREORDER', 'DEPOSIT')
            then 'Chưa trả vàng'
          else 'Đã giao'
        end as "goldReturnStatus",
        s.pickup_due_at as "goldReturnDueAt",
        case
          when s.transaction_type in ('PREORDER', 'DEPOSIT')
            then (
              select max(t.created_at)
              from public.pos_inventory_transactions t
              where t.reference_id = s.id
                and t.type = 'PREORDER_FULFILL'
            )
          else (
            select min(t.created_at)
            from public.pos_inventory_transactions t
            where t.reference_id = s.id
              and t.type = 'SALE'
          )
        end as "goldReturnedAt"
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
        coalesce(nullif(trim(c.citizen_id), ''), ''),
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
        bi.unit_price_dong as "unitPriceDong",
        ''::text as "goldReturnStatus",
        null::timestamptz as "goldReturnDueAt",
        null::timestamptz as "goldReturnedAt"
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

create or replace function public.pos_cashflow_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date;
  v_from7 date;
  v_cash jsonb;
  v_bank jsonb;
  v_total bigint;
  v_in7 bigint;
  v_out7 bigint;
  v_recv bigint;
  v_pay bigint;
  v_pay_receipts bigint;
  v_stock_capital bigint;
begin
  perform pos_private.require_admin();
  v_today := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_from7 := v_today - 6;

  select jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'accountType', a.account_type,
    'balanceDong', a.balance_dong,
    'inTodayDong', coalesce((
      select sum(l.amount_dong) from public.pos_cash_ledger l
      where l.account_id = a.id and l.direction = 'IN' and l.txn_type <> 'TRANSFER'
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0),
    'outTodayDong', coalesce((
      select sum(l.amount_dong) from public.pos_cash_ledger l
      where l.account_id = a.id and l.direction = 'OUT' and l.txn_type <> 'TRANSFER'
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0),
    'txnToday', coalesce((
      select count(*) from public.pos_cash_ledger l
      where l.account_id = a.id
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0)
  ) into v_cash
  from public.pos_cash_accounts a where a.code = 'CASH-001';

  select jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'accountType', a.account_type,
    'balanceDong', a.balance_dong,
    'inTodayDong', coalesce((
      select sum(l.amount_dong) from public.pos_cash_ledger l
      where l.account_id = a.id and l.direction = 'IN' and l.txn_type <> 'TRANSFER'
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0),
    'outTodayDong', coalesce((
      select sum(l.amount_dong) from public.pos_cash_ledger l
      where l.account_id = a.id and l.direction = 'OUT' and l.txn_type <> 'TRANSFER'
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0),
    'txnToday', coalesce((
      select count(*) from public.pos_cash_ledger l
      where l.account_id = a.id
        and (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date = v_today
    ), 0)
  ) into v_bank
  from public.pos_cash_accounts a where a.code = 'BANK-001';

  v_total := coalesce((v_cash->>'balanceDong')::bigint, 0)
           + coalesce((v_bank->>'balanceDong')::bigint, 0);

  select coalesce(sum(case when direction = 'IN' then amount_dong else 0 end), 0),
         coalesce(sum(case when direction = 'OUT' then amount_dong else 0 end), 0)
  into v_in7, v_out7
  from public.pos_cash_ledger
  where txn_type <> 'TRANSFER'
    and (timezone('Asia/Ho_Chi_Minh', occurred_at))::date between v_from7 and v_today;

  select coalesce(sum(remaining_dong), 0) into v_recv
  from public.pos_receivables where remaining_dong > 0 and status <> 'CLOSED';

  select coalesce(sum(remaining_dong), 0) into v_pay
  from public.pos_payables where remaining_dong > 0 and status <> 'CLOSED';

  select coalesce(sum(remaining_dong), 0) into v_pay_receipts
  from public.pos_purchase_receipts
  where voided_at is null
    and goods_status in ('RECEIVED', 'SOLD', 'RETURNED')
    and remaining_dong > 0;

  v_pay := v_pay + v_pay_receipts;

  select coalesce(sum(s.quantity::bigint * coalesce(s.last_cost_dong, 0)), 0)
  into v_stock_capital
  from public.pos_inventory_stock s
  where s.quantity > 0;

  return jsonb_build_object(
    'businessDate', v_today,
    'cash', v_cash,
    'bank', v_bank,
    'availableDong', v_total,
    'sevenDay', jsonb_build_object(
      'inDong', v_in7,
      'outDong', v_out7,
      'netDong', v_in7 - v_out7
    ),
    'receivableDong', v_recv,
    'payableDong', v_pay,
    'stockCapitalDong', v_stock_capital
  );
end;
$$;

revoke all on function public.pos_cashflow_overview() from public, anon;
grant execute on function public.pos_cashflow_overview() to authenticated;
