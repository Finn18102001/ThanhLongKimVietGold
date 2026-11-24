-- P10 M1: list phiếu mua đang chờ Quỹ tiền (và chờ Phiếu 02 sau khi QT confirm).
-- Mirror pattern pos_employee_sale_list_awaiting_gold — không đổi số dư / không sửa lịch sử.
-- Không CREATE TABLE → không cần Data API GRANT bảng (§32.1).

create or replace function public.pos_list_buys_awaiting_fund(
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
  v_total integer;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if not pos_private.employee_fund_flag_on() then
    return jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'seesAll', v_is_admin);
  end if;

  select count(*)::int into v_total
  from public.pos_buys b
  where b.status = 'PROCESSING'
    and b.workflow_status in ('INVOICE_ISSUED', 'FORM02_READY')
    and b.voided_at is null
    and (
      v_is_admin
      or lower(coalesce(b.actor_email, '')) = lower(v_email)
    );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      b.id as "buyId",
      b.buy_no as "buyNo",
      b.customer_id as "customerId",
      coalesce(b.customer_name_snapshot, c.name) as "customerName",
      coalesce(b.customer_phone_snapshot, c.phone) as "customerPhone",
      b.total_dong as "totalDong",
      b.intended_paid_dong as "intendedPaidDong",
      b.payment_method as "paymentMethod",
      b.workflow_status as "workflowStatus",
      b.status,
      b.actor_email as "actorEmail",
      b.created_at as "createdAt",
      yc.id as "requestId",
      yc.code as "requestCode",
      yc.status as "requestStatus",
      yc.amount_dong as "requestAmountDong",
      ca.code as "cashAccountCode",
      (
        select count(*)::int from public.pos_buy_items bi where bi.buy_id = b.id
      ) as "itemCount",
      case
        when yc.id is null then 'NEED_ISSUE'
        when yc.status = 'PENDING' then 'AWAITING_FUND'
        when yc.status = 'CONFIRMED' then 'FUND_CONFIRMED'
        when yc.status = 'REJECTED' then 'FUND_REJECTED'
        else coalesce(yc.status, 'NEED_ISSUE')
      end as "fundPhase",
      (yc.status = 'CONFIRMED') as "canCompleteForm02"
    from public.pos_buys b
    left join public.pos_customers c on c.id = b.customer_id
    left join lateral (
      select r.id, r.code, r.status, r.amount_dong, r.cash_account_id, r.created_at
      from public.pos_employee_cash_requests r
      where r.source_type = 'buy'
        and r.source_id = b.id
        and r.kind = 'CHI'
      order by
        case r.status
          when 'CONFIRMED' then 0
          when 'PENDING' then 1
          when 'REJECTED' then 2
          else 3
        end,
        r.created_at desc
      limit 1
    ) yc on true
    left join public.pos_employee_cash_accounts ca on ca.id = yc.cash_account_id
    where b.status = 'PROCESSING'
      and b.workflow_status in ('INVOICE_ISSUED', 'FORM02_READY')
      and b.voided_at is null
      and (
        v_is_admin
        or lower(coalesce(b.actor_email, '')) = lower(v_email)
      )
    order by b.created_at desc nulls last, b.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'seesAll', v_is_admin
  );
end;
$function$;

revoke all on function public.pos_list_buys_awaiting_fund(integer, integer) from public, anon;
grant execute on function public.pos_list_buys_awaiting_fund(integer, integer) to authenticated, service_role;
