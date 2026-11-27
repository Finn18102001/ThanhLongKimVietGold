-- Admin directory: Quản lý phiếu thu/chi (YC-THU/CHI).
-- Filter + phân trang; join quỹ tiền / quỹ vàng holder; không trả lines_json (detail riêng).
-- Indexes cho list theo ngày / người tạo / xác nhận / kind+status.
-- Không tạo bảng mới. §32.1: GRANT EXECUTE trên RPC public.

-- ---------------------------------------------------------------------------
-- Indexes (perf list)
-- ---------------------------------------------------------------------------
create index if not exists pos_employee_cash_requests_created_at_idx
  on public.pos_employee_cash_requests (created_at desc);

create index if not exists pos_employee_cash_requests_kind_status_created_idx
  on public.pos_employee_cash_requests (kind, status, created_at desc);

create index if not exists pos_employee_cash_requests_requested_by_idx
  on public.pos_employee_cash_requests (lower(requested_by_email), created_at desc);

create index if not exists pos_employee_cash_requests_confirmed_by_idx
  on public.pos_employee_cash_requests (lower(confirmed_by_email), created_at desc)
  where confirmed_by_email is not null;

create index if not exists pos_employee_cash_requests_cash_account_idx
  on public.pos_employee_cash_requests (cash_account_id)
  where cash_account_id is not null;

-- ---------------------------------------------------------------------------
-- List RPC (admin reader)
-- ---------------------------------------------------------------------------
create or replace function public.pos_admin_list_cash_vouchers(
  p_from date default null,
  p_to date default null,
  p_code text default null,
  p_kind text default null,
  p_status text default null,
  p_created_by text default null,
  p_confirmed_by text default null,
  p_cash_holder text default null,
  p_gold_holder text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_code text := nullif(lower(trim(coalesce(p_code, ''))), '');
  v_kind text := nullif(upper(trim(coalesce(p_kind, ''))), '');
  v_status text := nullif(upper(trim(coalesce(p_status, ''))), '');
  v_created text := nullif(lower(trim(coalesce(p_created_by, ''))), '');
  v_confirmed text := nullif(lower(trim(coalesce(p_confirmed_by, ''))), '');
  v_cash text := nullif(lower(trim(coalesce(p_cash_holder, ''))), '');
  v_gold text := nullif(lower(trim(coalesce(p_gold_holder, ''))), '');
  v_total integer;
  v_items jsonb;
begin
  perform pos_private.require_admin_reader();

  if v_kind is not null and v_kind not in ('THU', 'CHI') then
    raise exception 'CASH_VOUCHER_KIND_INVALID' using errcode = '22023';
  end if;
  if v_status is not null
     and v_status not in ('PENDING', 'CONFIRMED', 'REJECTED', 'REVERSED') then
    raise exception 'CASH_VOUCHER_STATUS_INVALID' using errcode = '22023';
  end if;

  select count(*)::integer into v_total
  from public.pos_employee_cash_requests r
  left join public.pos_employee_cash_accounts ca on ca.id = r.cash_account_id
  left join public.pos_staff cs on cs.id = ca.staff_id
  left join public.pos_employee_gold_accounts ga on ga.id = r.related_gold_account_id
  where (p_from is null
         or (r.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
    and (p_to is null
         or (r.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
    and (
      v_code is null
      or lower(r.code) like '%' || v_code || '%'
      or lower(coalesce(r.source_code, '')) like '%' || v_code || '%'
    )
    and (v_kind is null or r.kind = v_kind)
    and (v_status is null or r.status = v_status)
    and (
      v_created is null
      or lower(r.requested_by_email) like '%' || v_created || '%'
    )
    and (
      v_confirmed is null
      or lower(coalesce(r.confirmed_by_email, '')) like '%' || v_confirmed || '%'
      or lower(coalesce(r.rejected_by_email, '')) like '%' || v_confirmed || '%'
    )
    and (
      v_cash is null
      or lower(coalesce(ca.code, '')) like '%' || v_cash || '%'
      or lower(coalesce(ca.name, '')) like '%' || v_cash || '%'
      or lower(coalesce(cs.full_name, '')) like '%' || v_cash || '%'
      or lower(coalesce(cs.email, '')) like '%' || v_cash || '%'
    )
    and (
      v_gold is null
      or lower(coalesce(r.related_staff_name, '')) like '%' || v_gold || '%'
      or lower(coalesce(ga.code, '')) like '%' || v_gold || '%'
      or lower(coalesce(ga.name, '')) like '%' || v_gold || '%'
    );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      r.id,
      r.code,
      r.kind,
      r.status,
      r.amount_dong as "amountDong",
      r.payment_method as "paymentMethod",
      r.content,
      r.source_type as "sourceType",
      r.source_id as "sourceId",
      r.source_code as "sourceCode",
      r.customer_name as "customerName",
      r.requested_by_email as "createdByEmail",
      r.created_at as "createdAt",
      ca.code as "cashAccountCode",
      ca.name as "cashAccountName",
      cs.full_name as "cashHolderName",
      cs.email as "cashHolderEmail",
      ga.code as "goldAccountCode",
      ga.name as "goldAccountName",
      r.related_staff_name as "goldHolderName",
      r.confirmed_by_email as "confirmedByEmail",
      r.confirmed_at as "confirmedAt",
      r.rejected_by_email as "rejectedByEmail",
      r.rejected_at as "rejectedAt",
      r.reject_reason as "rejectReason",
      r.reversed_by_email as "reversedByEmail",
      r.reversed_at as "reversedAt"
    from public.pos_employee_cash_requests r
    left join public.pos_employee_cash_accounts ca on ca.id = r.cash_account_id
    left join public.pos_staff cs on cs.id = ca.staff_id
    left join public.pos_employee_gold_accounts ga on ga.id = r.related_gold_account_id
    where (p_from is null
           or (r.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null
           or (r.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (
        v_code is null
        or lower(r.code) like '%' || v_code || '%'
        or lower(coalesce(r.source_code, '')) like '%' || v_code || '%'
      )
      and (v_kind is null or r.kind = v_kind)
      and (v_status is null or r.status = v_status)
      and (
        v_created is null
        or lower(r.requested_by_email) like '%' || v_created || '%'
      )
      and (
        v_confirmed is null
        or lower(coalesce(r.confirmed_by_email, '')) like '%' || v_confirmed || '%'
        or lower(coalesce(r.rejected_by_email, '')) like '%' || v_confirmed || '%'
      )
      and (
        v_cash is null
        or lower(coalesce(ca.code, '')) like '%' || v_cash || '%'
        or lower(coalesce(ca.name, '')) like '%' || v_cash || '%'
        or lower(coalesce(cs.full_name, '')) like '%' || v_cash || '%'
        or lower(coalesce(cs.email, '')) like '%' || v_cash || '%'
      )
      and (
        v_gold is null
        or lower(coalesce(r.related_staff_name, '')) like '%' || v_gold || '%'
        or lower(coalesce(ga.code, '')) like '%' || v_gold || '%'
        or lower(coalesce(ga.name, '')) like '%' || v_gold || '%'
      )
    order by r.created_at desc
    limit v_limit
    offset v_offset
  ) t;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function public.pos_admin_list_cash_vouchers(
  date, date, text, text, text, text, text, text, text, integer, integer
) from public, anon;
grant execute on function public.pos_admin_list_cash_vouchers(
  date, date, text, text, text, text, text, text, text, integer, integer
) to authenticated, service_role;
