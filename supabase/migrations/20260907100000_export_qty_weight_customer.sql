-- Excel export enrichments (filters unchanged; revenue math unchanged):
-- 1) pos_export_transactions: SL bán + Số chỉ from sale/buy line items
-- 2) pos_export_documents: one row per product line (name, qty, weight)
-- 3) pos_cashflow_list: customer name + CCCD from linked sale/buy/invoice

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
        s.completed_at as "completedAt",
        coalesce((
          select sum(si.quantity)::bigint
          from public.pos_sale_items si
          where si.sale_id = s.id
        ), 0) as "quantitySold",
        coalesce((
          select sum(si.quantity * si.weight_chi)::numeric
          from public.pos_sale_items si
          where si.sale_id = s.id
        ), 0) as "weightChiSold"
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
        b.completed_at,
        coalesce((
          select sum(bi.quantity)::bigint
          from public.pos_buy_items bi
          where bi.buy_id = b.id
        ), 0),
        coalesce((
          select sum(bi.quantity * bi.weight_chi)::numeric
          from public.pos_buy_items bi
          where bi.buy_id = b.id
        ), 0)
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

-- Line-level document export. `total` remains document count (same as list filters).
-- CTE docs/lines must stay in ONE statement (search_path='').
create or replace function public.pos_export_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(nullif(trim(coalesce(p_q, '')), ''));
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
      null::uuid as receipt_id
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
      null::uuid
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where b.status = 'COMPLETED'
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
      coalesce(r.received_at, r.created_at),
      r.supplier_name,
      null::text,
      r.total_dong,
      r.paid_dong,
      r.remaining_dong,
      r.payment_status,
      null::text,
      r.receipt_no,
      null::uuid,
      null::uuid,
      r.id
    from public.pos_purchase_receipts r
    where r.status = 'RECEIVED'
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(r.receipt_no) like '%' || v_q || '%'
        or lower(r.supplier_name) like '%' || v_q || '%'
      )
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
      1 as line_ord
    from docs d
    join public.pos_sale_items si on si.sale_id = d.sale_id
    left join public.pos_skus sk on sk.id = si.sku_id
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
      1
    from docs d
    join public.pos_buy_items bi on bi.buy_id = d.buy_id
    left join public.pos_skus sk on sk.id = bi.sku_id
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
      1
    from docs d
    join public.pos_purchase_items pi on pi.receipt_id = d.receipt_id
    left join public.pos_skus sk on sk.id = pi.sku_id
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
      0
    from docs d
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
  counted as (
    select count(*)::int as total from docs
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
      l.weight_chi as "weightChi"
    from lines l
    order by l.issued_at desc, l.document_no, l.line_ord, l.product_name
    limit 50000
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb),
    'total', (select total from counted),
    'limit', 50000,
    'offset', 0
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.pos_export_documents(text, text, date, date, text)
  from public, anon;
grant execute on function public.pos_export_documents(text, text, date, date, text)
  to authenticated;

create or replace function public.pos_cashflow_list(
  p_from date,
  p_to date,
  p_account_id uuid default null,
  p_txn_type text default null,
  p_direction text default null,
  p_q text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb;
  v_total integer;
  v_in bigint;
  v_out bigint;
begin
  perform pos_private.require_admin();

  select count(*),
         coalesce(sum(case when l.direction = 'IN' and l.txn_type <> 'TRANSFER' then l.amount_dong else 0 end), 0),
         coalesce(sum(case when l.direction = 'OUT' and l.txn_type <> 'TRANSFER' then l.amount_dong else 0 end), 0)
  into v_total, v_in, v_out
  from public.pos_cash_ledger l
  join public.pos_cash_accounts a on a.id = l.account_id
  where (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date between p_from and p_to
    and (p_account_id is null or l.account_id = p_account_id)
    and (p_txn_type is null or p_txn_type = '' or l.txn_type = p_txn_type)
    and (p_direction is null or p_direction = '' or l.direction = p_direction)
    and (
      p_q is null or trim(p_q) = ''
      or l.content ilike '%' || trim(p_q) || '%'
      or coalesce(l.reference_code, '') ilike '%' || trim(p_q) || '%'
      or l.actor_email ilike '%' || trim(p_q) || '%'
    );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      l.id,
      l.occurred_at as "occurredAt",
      l.txn_type as "txnType",
      l.direction,
      l.amount_dong as "amountDong",
      l.balance_after_dong as "balanceAfterDong",
      l.content,
      a.code as "accountCode",
      a.name as "accountName",
      l.reference_code as "referenceCode",
      l.actor_email as "actorEmail",
      coalesce(c_sale.name, c_buy.name, c_inv.name, c_buy_void.name) as "customerName",
      coalesce(
        c_sale.citizen_id,
        c_buy.citizen_id,
        c_inv.citizen_id,
        c_buy_void.citizen_id
      ) as "customerCitizenId"
    from public.pos_cash_ledger l
    join public.pos_cash_accounts a on a.id = l.account_id
    left join public.pos_sales s
      on l.reference_type = 'sale' and s.id = l.reference_id
    left join public.pos_customers c_sale
      on c_sale.id = s.customer_id
    left join public.pos_buys b
      on l.reference_type = 'buy' and b.id = l.reference_id
    left join public.pos_customers c_buy
      on c_buy.id = b.customer_id
    left join public.pos_invoices inv
      on l.reference_type = 'INVOICE_VOID' and inv.id = l.reference_id
    left join public.pos_customers c_inv
      on c_inv.id = inv.customer_id
    left join public.pos_buys b_void
      on l.reference_type = 'BUY_VOID' and b_void.id = l.reference_id
    left join public.pos_customers c_buy_void
      on c_buy_void.id = b_void.customer_id
    where (timezone('Asia/Ho_Chi_Minh', l.occurred_at))::date between p_from and p_to
      and (p_account_id is null or l.account_id = p_account_id)
      and (p_txn_type is null or p_txn_type = '' or l.txn_type = p_txn_type)
      and (p_direction is null or p_direction = '' or l.direction = p_direction)
      and (
        p_q is null or trim(p_q) = ''
        or l.content ilike '%' || trim(p_q) || '%'
        or coalesce(l.reference_code, '') ilike '%' || trim(p_q) || '%'
        or l.actor_email ilike '%' || trim(p_q) || '%'
      )
    order by l.occurred_at desc, l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 5000))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'sumInDong', v_in,
    'sumOutDong', v_out,
    'netDong', v_in - v_out
  );
end;
$$;

revoke all on function public.pos_cashflow_list(date, date, uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.pos_cashflow_list(date, date, uuid, text, text, text, integer, integer) to authenticated;
