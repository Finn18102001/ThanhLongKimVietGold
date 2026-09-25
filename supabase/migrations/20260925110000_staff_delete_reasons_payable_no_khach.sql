-- 1) Staff delete: clear Vietnamese reasons; never wipe business history.
-- 2) Cashflow "Phải trả" = Nợ khách from PREORDER/DEPOSIT (other debt logics unchanged).

create or replace function pos_private.delete_staff(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_email text;
  v_auth uuid;
  v_self text := public.tlkv_current_email();
  v_has_sales boolean;
  v_has_payments boolean;
begin
  begin
    v_actor := pos_private.require_admin();
  exception
    when insufficient_privilege then
      raise exception 'Không đủ quyền thực hiện.' using errcode = '42501';
    when others then
      if sqlerrm ilike '%forbidden%' then
        raise exception 'Không đủ quyền thực hiện.' using errcode = '42501';
      end if;
      raise;
  end;

  select email, auth_user_id into v_email, v_auth
  from public.pos_staff
  where id = p_id;
  if not found then
    raise exception 'Không tìm thấy nhân viên' using errcode = 'P0002';
  end if;

  if v_self <> '' and lower(trim(v_email)) = v_self then
    raise exception 'Không thể xóa tài khoản đang đăng nhập' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.pos_sales s where s.operator_staff_id = p_id
  ) into v_has_sales;

  select exists (
    select 1 from public.pos_sale_payments p where p.received_by_staff_id = p_id
  ) into v_has_payments;

  if v_has_sales or v_has_payments then
    raise exception
      'Nhân viên đang có hóa đơn/giao dịch liên quan. Không thể xóa — hãy tắt tài khoản.'
      using errcode = 'P0001';
  end if;

  begin
    delete from public.pos_staff where id = p_id;
  exception
    when foreign_key_violation then
      raise exception
        'Đang có dữ liệu nghiệp vụ không thể xóa. Không thể xóa nhân viên — hãy tắt tài khoản.'
        using errcode = 'P0001';
  end;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'STAFF_DELETE', 'staff', p_id, 'Xóa hồ sơ nhân viên',
    jsonb_build_object('email', v_email, 'auth_user_id', v_auth)
  );

  return jsonb_build_object('ok', true, 'auth_user_id', v_auth, 'email', v_email);
end;
$$;

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

  -- Phải thu: unchanged (pos_receivables)
  select coalesce(sum(remaining_dong), 0) into v_recv
  from public.pos_receivables where remaining_dong > 0 and status <> 'CLOSED';

  -- Phải trả = Nợ khách (đơn đặt PREORDER/DEPOSIT):
  -- - đã lấy hàng, chưa trả đủ → remaining_dong
  -- - chưa lấy hàng → toàn bộ total_dong
  -- BUY payables + NCC AP remain in CashObligations / other screens.
  select coalesce(sum(
    case
      when s.fulfillment_status = 'FULFILLED' and s.remaining_dong > 0
        then s.remaining_dong
      when s.fulfillment_status in ('UNFULFILLED', 'READY')
        then s.total_dong
      else 0
    end
  ), 0)
  into v_pay
  from public.pos_sales s
  where s.transaction_type in ('PREORDER', 'DEPOSIT')
    and s.status = 'COMPLETED'
    and s.voided_at is null
    and s.fulfillment_status is distinct from 'CANCELLED';

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
