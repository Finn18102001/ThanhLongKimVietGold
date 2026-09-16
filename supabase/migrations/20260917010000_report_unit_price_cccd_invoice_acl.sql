-- SRS: report unit price per chỉ + CCCD column; sale-invoice ACL (staff own / admin all).

-- ---------------------------------------------------------------------------
-- 1) Helper: staff may only touch own sales; admin reader sees/mutates all.
-- ---------------------------------------------------------------------------
create or replace function pos_private.assert_own_or_admin_sale(p_sale_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := pos_private.require_pos_user();
  v_owner text;
begin
  if public.tlkv_can_admin_read() then
    return;
  end if;

  select lower(trim(coalesce(s.actor_email, '')))
  into v_owner
  from public.pos_sales s
  where s.id = p_sale_id;

  if v_owner is null then
    raise exception 'Không tìm thấy đơn bán' using errcode = 'P0002';
  end if;

  if v_owner is distinct from v_actor then
    raise exception 'Không có quyền thao tác hóa đơn của nhân viên khác'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function pos_private.assert_own_or_admin_sale(uuid) from public, anon;
grant execute on function pos_private.assert_own_or_admin_sale(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Export transactions: đơn giá / 1 chỉ + CCCD khách hàng
-- ---------------------------------------------------------------------------
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
        s.actor_email as "actorEmail",
        s.completed_at as "completedAt",
        si.quantity::bigint as "quantitySold",
        (si.quantity * si.weight_chi)::numeric as "weightChiSold",
        coalesce(nullif(trim(si.sku_snapshot), ''), sk.sku, '') as "sku",
        coalesce(nullif(trim(br.name), ''), '') as "brandName",
        coalesce(nullif(trim(si.product_name_snapshot), ''), sk.name, '') as "productName",
        coalesce(s.note, '') as "note",
        -- Đơn giá hiển thị = giá giao dịch SP / số chỉ (snapshot), không lấy giá hiện tại.
        case
          when coalesce(si.weight_chi, 0) > 0
            then round(si.unit_price_dong::numeric / si.weight_chi)::bigint
          else si.unit_price_dong
        end as "unitPriceDong"
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
        -- Mua vào: unit_price_dong đã là giá / chỉ tại thời điểm giao dịch.
        bi.unit_price_dong as "unitPriceDong"
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

-- ---------------------------------------------------------------------------
-- 3) List documents: STAFF only own SALE invoices; admin sees all.
-- ---------------------------------------------------------------------------
create or replace function public.pos_list_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_q_doc boolean := v_q is not null and v_q ~ '^[0-9a-z\-]+$' and v_q ~ '[0-9]';
  v_total int;
  v_items jsonb;
  v_actor text;
  v_admin boolean;
begin
  v_actor := pos_private.require_pos_user();
  v_admin := public.tlkv_can_admin_read();

  if p_document_type is not null and p_document_type not in (
    'SALE_TO_CUSTOMER', 'PURCHASE_FROM_CUSTOMER', 'STOCK_RECEIPT'
  ) then
    raise exception 'Loai chung tu khong hop le' using errcode = '22023';
  end if;
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'
  ) then
    raise exception 'Trang thai thanh toan khong hop le' using errcode = '22023';
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
      s.transaction_type::text as transaction_type,
      coalesce(
        s.fulfillment_status::text,
        case
          when s.transaction_type::text in ('PREORDER', 'DEPOSIT') then 'UNFULFILLED'
          else 'DELIVERED'
        end
      ) as fulfillment_status
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    join public.pos_customers c on c.id = i.customer_id
    where s.status = 'COMPLETED'
      and i.status is distinct from 'VOIDED'
      and i.voided_at is null
      and s.status is distinct from 'VOIDED'
      and (v_admin or lower(trim(coalesce(i.actor_email, s.actor_email, ''))) = v_actor)
      and (p_document_type is null or p_document_type = 'SALE_TO_CUSTOMER')
      and (p_from is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or s.payment_status = p_payment_status)
      and (
        v_q is null
        or i.invoice_no ilike '%' || v_q || '%'
        or s.sale_no ilike '%' || v_q || '%'
        or c.phone ilike '%' || v_q || '%'
        or (not v_q_doc and c.name ilike '%' || v_q || '%')
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
      'SALE'::text,
      'DELIVERED'::text
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where (
        b.status = 'COMPLETED'
        or (
          b.status = 'PROCESSING'
          and b.workflow_status in ('INVOICE_ISSUED', 'FORM02_READY')
        )
      )
      and b.status is distinct from 'VOIDED'
      and b.status is distinct from 'CANCELLED'
      and b.voided_at is null
      and (p_document_type is null or p_document_type = 'PURCHASE_FROM_CUSTOMER')
      and (p_from is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or b.payment_status = p_payment_status)
      and (
        v_q is null
        or b.buy_no ilike '%' || v_q || '%'
        or coalesce(b.customer_phone_snapshot, c.phone) ilike '%' || v_q || '%'
        or (
          not v_q_doc
          and coalesce(b.customer_name_snapshot, c.name) ilike '%' || v_q || '%'
        )
      )

    union all

    select
      r.id,
      r.receipt_no,
      'STOCK_RECEIPT',
      coalesce(r.completed_at, r.received_at, r.created_at),
      r.supplier_name,
      null::text,
      r.total_dong,
      r.paid_dong,
      r.remaining_dong,
      r.payment_status,
      r.payment_method,
      r.receipt_no,
      'SALE'::text,
      'DELIVERED'::text
    from public.pos_purchase_receipts r
    where r.document_status = 'COMPLETED'
      and coalesce(r.status, '') is distinct from 'CANCELLED'
      and r.voided_at is null
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (
        v_q is null
        or r.receipt_no ilike '%' || v_q || '%'
        or (not v_q_doc and r.supplier_name ilike '%' || v_q || '%')
      )
  ),
  counted as (
    select count(*)::int as total from docs
  ),
  paged as (
    select
      d.id,
      d.document_no as "documentNo",
      d.document_type as "documentType",
      d.issued_at as "issuedAt",
      d.party_name as "partyName",
      d.party_phone as "partyPhone",
      d.total_dong as "totalDong",
      d.paid_dong as "paidDong",
      d.remaining_dong as "remainingDong",
      d.payment_status as "paymentStatus",
      d.payment_method as "paymentMethod",
      d.ref_no as "refNo",
      d.transaction_type as "transactionType",
      d.fulfillment_status as "fulfillmentStatus"
    from docs d
    order by d.issued_at desc
    limit v_limit offset v_offset
  )
  select
    (select total from counted),
    coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb)
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;

revoke all on function public.pos_list_documents(text, text, date, date, text, integer, integer)
  from public, anon;
grant execute on function public.pos_list_documents(text, text, date, date, text, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Mutation wrappers: enforce sale ownership for non-admin.
-- ---------------------------------------------------------------------------
create or replace function public.pos_collect_sale_payment(
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
as $$
begin
  perform pos_private.assert_own_or_admin_sale(p_sale_id);
  return pos_private.collect_sale_payment(
    p_sale_id,
    p_amount_dong,
    p_payment_method,
    p_note,
    p_idempotency_key,
    p_due_date,
    p_operator_staff_id
  );
end;
$$;

revoke all on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date, uuid)
  from public, anon;
grant execute on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date, uuid)
  to authenticated;

create or replace function public.pos_collect_sale_payment(
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
set search_path to ''
as $$
begin
  perform pos_private.assert_own_or_admin_sale(p_sale_id);
  return pos_private.collect_sale_payment(
    p_sale_id,
    p_amount_dong,
    p_payment_method,
    p_note,
    p_idempotency_key,
    p_due_date,
    null::uuid
  );
end;
$$;

revoke all on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date)
  from public, anon;
grant execute on function public.pos_collect_sale_payment(uuid, bigint, text, text, text, date)
  to authenticated;

create or replace function public.pos_cancel_preorder(
  p_sale_id uuid,
  p_idempotency_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor text;
  v_cached jsonb;
  v_sale public.pos_sales%rowtype;
  v_result jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform pos_private.assert_own_or_admin_sale(p_sale_id);
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'cancel_preorder');
  if v_cached is not null then return v_cached; end if;
  begin
    select * into v_sale from public.pos_sales where id = p_sale_id for update;
    if v_sale.id is null then raise exception 'Không tìm thấy đơn' using errcode = 'P0002'; end if;
    if v_sale.transaction_type <> 'PREORDER' then raise exception 'Chỉ hủy đơn đặt hàng' using errcode = '22023'; end if;
    if v_sale.fulfillment_status = 'FULFILLED' then raise exception 'Đơn đã giao, không hủy tại phase này' using errcode = '22023'; end if;
    if v_sale.fulfillment_status = 'CANCELLED' then
      v_result := jsonb_build_object('ok', true, 'sale_id', v_sale.id, 'fulfillment_status', 'CANCELLED');
      return pos_private.finish_idempotency(p_idempotency_key, v_result);
    end if;
    update public.pos_sales set fulfillment_status = 'CANCELLED' where id = v_sale.id;
    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (v_actor, 'PREORDER_CANCEL', 'sale', v_sale.id, coalesce(v_reason, 'Hủy đơn đặt hàng'),
      jsonb_build_object('sale_no', v_sale.sale_no, 'paid_dong', v_sale.paid_dong, 'remaining_dong', v_sale.remaining_dong));
    v_result := jsonb_build_object('ok', true, 'sale_id', v_sale.id, 'sale_no', v_sale.sale_no, 'fulfillment_status', 'CANCELLED',
      'paid_dong', v_sale.paid_dong, 'remaining_dong', v_sale.remaining_dong);
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

revoke all on function public.pos_cancel_preorder(uuid, text, text) from public, anon;
grant execute on function public.pos_cancel_preorder(uuid, text, text) to authenticated;

create or replace function public.pos_fulfill_preorder(
  p_sale_id uuid,
  p_idempotency_key text,
  p_operator_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform pos_private.assert_own_or_admin_sale(p_sale_id);
  return public.pos_deliver_sale_items(
    p_sale_id, p_idempotency_key, null, p_operator_staff_id, true
  );
end;
$function$;

revoke all on function public.pos_fulfill_preorder(uuid, text, uuid) from public, anon;
grant execute on function public.pos_fulfill_preorder(uuid, text, uuid) to authenticated;
