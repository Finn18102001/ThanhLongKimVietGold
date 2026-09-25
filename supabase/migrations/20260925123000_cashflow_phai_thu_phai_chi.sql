-- Cashflow KPI + obligations alignment:
-- Phải thu  = PREORDER/DEPOSIT remaining (customer still owes shop)
-- Phải chi  = BUY remaining + purchase-receipt remaining (incl. NOT_RECEIVED partial pay)

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
  v_pay_buys bigint;
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

  -- Phải thu: đơn đặt hàng / đặt cọc khách còn nợ tiền (TT một phần hoặc chưa trả đủ).
  select coalesce(sum(s.remaining_dong), 0)
  into v_recv
  from public.pos_sales s
  where s.transaction_type in ('PREORDER', 'DEPOSIT')
    and s.status = 'COMPLETED'
    and s.voided_at is null
    and s.remaining_dong > 0
    and s.fulfillment_status is distinct from 'CANCELLED';

  -- Phải chi: mua từ khách còn nợ + nhập hàng còn nợ (kể cả chưa nhận hàng).
  select coalesce(sum(b.remaining_dong), 0)
  into v_pay_buys
  from public.pos_buys b
  where b.status = 'COMPLETED'
    and b.remaining_dong > 0;

  select coalesce(sum(r.remaining_dong), 0)
  into v_pay_receipts
  from public.pos_purchase_receipts r
  where r.voided_at is null
    and r.remaining_dong > 0
    and coalesce(r.goods_status, '') is distinct from 'CANCELLED';

  v_pay := v_pay_buys + v_pay_receipts;

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
