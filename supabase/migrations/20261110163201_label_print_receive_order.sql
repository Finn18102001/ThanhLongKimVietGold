-- Phase 1 · Section 1 — Nhập hàng kiêm in tem (docs/pos-big-update/P1-01-RECEIVE-LABEL.md)
-- Additive only: new nullable column + new RPC wrapping pos_receive_order_purchase (unchanged).

alter table public.products
  add column if not exists gold_age numeric(7,3);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass and conname = 'products_gold_age_range'
  ) then
    alter table public.products
      add constraint products_gold_age_range
      check (gold_age is null or (gold_age > 0 and gold_age <= 1000));
  end if;
end $$;

comment on column public.products.gold_age is
  'Tuổi vàng / hàm lượng (tối đa 3 số thập phân), VD 999.9, 750, 610.5. Nullable.';

create or replace function public.pos_receive_label_order_purchase(
  p_idempotency_key text,
  p_supplier_name text,
  p_reason text,
  p_item jsonb,
  p_payment_method text default 'CASH',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order jsonb;
  v_method text := upper(trim(coalesce(p_payment_method, '')));
  v_received integer;
  v_cost bigint;
  v_gold_age_raw text;
  v_gold_age numeric;
  v_result jsonb;
  v_receipt uuid;
  v_sku_id uuid;
  v_sku_code text;
  v_product_id text;
  v_fresh boolean;
begin
  perform pos_private.require_admin();

  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'Thiếu thông tin hàng nhập' using errcode = '22023';
  end if;
  v_order := p_item -> 'order_product';
  if v_order is null or jsonb_typeof(v_order) <> 'object' then
    raise exception 'Thiếu thông tin sản phẩm Order' using errcode = '22023';
  end if;

  if v_method not in ('CASH', 'TRANSFER') then
    raise exception 'Hình thức thanh toán chỉ nhận Tiền mặt hoặc Chuyển khoản' using errcode = '22023';
  end if;

  if coalesce(p_item ->> 'received_qty', '') !~ '^[0-9]+$' then
    raise exception 'Số nhận thực tế phải là số nguyên > 0' using errcode = '22023';
  end if;
  v_received := (p_item ->> 'received_qty')::integer;
  if v_received <= 0 then
    raise exception 'Số nhận thực tế phải là số nguyên > 0' using errcode = '22023';
  end if;

  if coalesce(p_item ->> 'cost_price_dong', '') !~ '^[0-9]+$' then
    raise exception 'Giá vốn phải là số nguyên VND không âm' using errcode = '22023';
  end if;
  v_cost := (p_item ->> 'cost_price_dong')::bigint;

  v_gold_age_raw := nullif(trim(coalesce(v_order ->> 'gold_age', '')), '');
  if v_gold_age_raw is not null then
    if v_gold_age_raw !~ '^[0-9]{1,4}(\.[0-9]{1,3})?$' then
      raise exception 'Tuổi vàng là số, tối đa 3 chữ số thập phân' using errcode = '22023';
    end if;
    v_gold_age := v_gold_age_raw::numeric;
    if v_gold_age <= 0 or v_gold_age > 1000 then
      raise exception 'Tuổi vàng phải lớn hơn 0 và không quá 1000' using errcode = '22023';
    end if;
  end if;

  v_result := public.pos_receive_order_purchase(
    p_idempotency_key,
    p_supplier_name,
    p_reason,
    jsonb_build_array(p_item),
    v_cost * v_received,
    v_method,
    'RECEIVED',
    null,
    p_note
  );

  -- pos_receive_order_purchase only appends orderSkus on a fresh run; replays return the stored response.
  v_fresh := v_result ? 'orderSkus';
  v_receipt := nullif(v_result ->> 'receipt_id', '')::uuid;

  select i.sku_id, s.sku, s.catalog_product_id
  into v_sku_id, v_sku_code, v_product_id
  from public.pos_purchase_items i
  join public.pos_skus s on s.id = i.sku_id
  where i.receipt_id = v_receipt
  limit 1;

  if v_sku_id is null then
    raise exception 'Không tìm thấy mã hàng của phiếu nhập vừa tạo' using errcode = 'P0001';
  end if;

  if v_fresh and v_gold_age is not null and v_product_id is not null then
    update public.products set gold_age = v_gold_age where id = v_product_id;
  end if;

  return v_result || jsonb_build_object(
    'sku_id', v_sku_id,
    'sku_code', v_sku_code,
    'replayed', not v_fresh
  );
end;
$function$;

revoke all on function public.pos_receive_label_order_purchase(text, text, text, jsonb, text, text) from public;
revoke all on function public.pos_receive_label_order_purchase(text, text, text, jsonb, text, text) from anon;
grant execute on function public.pos_receive_label_order_purchase(text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.pos_receive_label_order_purchase(text, text, text, jsonb, text, text) to service_role;
