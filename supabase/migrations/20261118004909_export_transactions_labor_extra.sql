-- P9: Báo cáo Excel thêm cột Tiền công + Phụ thu thêm (cuối file CSV).
-- Backup: tlkv_backup_20261110._routines__p9_export_labor_extra
-- Chữ ký giữ nguyên (date, date) → GRANT cũ còn hiệu lực.

CREATE OR REPLACE FUNCTION public.pos_export_transactions(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          (select nullif(trim(st.full_name), '') from public.pos_staff st where st.id = s.operator_staff_id),
          s.actor_email
        ) as "actorEmail",
        s.completed_at as "completedAt",
        si.quantity::bigint as "quantitySold",
        (si.quantity * si.weight_chi)::numeric as "weightChiSold",
        coalesce(nullif(trim(si.sku_snapshot), ''), sk.sku, '') as "sku",
        coalesce(nullif(trim(br.name), ''), '') as "brandName",
        coalesce(pos_private.price_row_purity(si.price_row_id), pos_private.sku_purity(si.sku_id)) as "purity",
        coalesce(nullif(trim(si.product_name_snapshot), ''), sk.name, '') as "productName",
        coalesce(s.note, '') as "note",
        case
          when coalesce(si.weight_chi, 0) > 0 then round(si.unit_price_dong::numeric / si.weight_chi)::bigint
          else si.unit_price_dong
        end as "unitPriceDong",
        case
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'FULFILLED' then 'Đã trả vàng'
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'CANCELLED' then 'Đã hủy'
          when s.transaction_type in ('PREORDER', 'DEPOSIT') and s.fulfillment_status = 'READY' then 'Sẵn sàng giao'
          when s.transaction_type in ('PREORDER', 'DEPOSIT') then 'Chưa trả vàng'
          else 'Đã giao'
        end as "goldReturnStatus",
        s.pickup_due_at as "goldReturnDueAt",
        case
          when s.transaction_type in ('PREORDER', 'DEPOSIT') then (
            select max(t.created_at) from public.pos_inventory_transactions t
            where t.reference_id = s.id and t.type = 'PREORDER_FULFILL'
          )
          else (
            select min(t.created_at) from public.pos_inventory_transactions t
            where t.reference_id = s.id and t.type = 'SALE'
          )
        end as "goldReturnedAt",
        (coalesce(si.labor_final_dong, 0) * si.quantity)::bigint as "laborFinalDong",
        coalesce((
          select sum(ch.amount_dong)::bigint
          from public.pos_sale_charges ch
          where ch.sale_id = s.id
        ), 0)::bigint as "extraChargesDong"
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
        'BUY'::text, b.buy_no, null::text, c.name, c.phone,
        coalesce(nullif(trim(c.citizen_id), ''), ''),
        bi.total_price_dong, b.paid_dong, b.remaining_dong, b.payment_status, b.payment_method, b.due_date,
        b.actor_email, b.completed_at, bi.quantity::bigint, (bi.quantity * bi.weight_chi)::numeric,
        coalesce(sk.sku, ''), coalesce(nullif(trim(bi.brand_name), ''), br.name, ''),
        coalesce(nullif(trim(bi.gold_age), ''), pos_private.price_row_purity(bi.price_row_id), pos_private.sku_purity(bi.sku_id)),
        coalesce(nullif(trim(bi.product_name_snapshot), ''), sk.name, ''), coalesce(b.note, ''),
        bi.unit_price_dong, ''::text, null::timestamptz, null::timestamptz,
        0::bigint, 0::bigint
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
$function$
;

revoke all on function public.pos_export_transactions(date, date) from public, anon;
grant execute on function public.pos_export_transactions(date, date) to authenticated;
