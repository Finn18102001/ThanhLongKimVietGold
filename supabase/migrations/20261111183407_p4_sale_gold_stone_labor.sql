-- Phase 4.4 — Bán vàng kèm đá: giá vàng (bảng giá lúc bán) + giá đá (sửa được) + tiền công (gốc ± điều chỉnh)
-- docs/pos-big-update/P4-00-GOLD-STONE.md C5–C8. Thay D9 Phase 1: MG bán theo dòng giá nhóm, không còn theo giá vốn.
-- pos_sale_items: bảng có sẵn, grant mức bảng (authenticated SELECT) → cột mới tự expose (§32.1).

-- 0. Backup
create table if not exists tlkv_backup_20261110.pos_sale_items__p4 as table public.pos_sale_items;
create table if not exists tlkv_backup_20261110.pos_skus__p4_sale as table public.pos_skus;

-- 1. Cột snapshot dòng bán
alter table public.pos_sale_items
  add column if not exists gold_amount_dong bigint,
  add column if not exists stone_weight_chi numeric(12,4) not null default 0,
  add column if not exists stone_price_dong bigint not null default 0,
  add column if not exists stone_price_default_dong bigint not null default 0,
  add column if not exists labor_adjust_dong bigint not null default 0,
  add column if not exists labor_final_dong bigint;

alter table public.pos_sale_items drop constraint if exists pos_sale_items_stone_labor_chk;
alter table public.pos_sale_items
  add constraint pos_sale_items_stone_labor_chk check (
    stone_weight_chi >= 0 and stone_price_dong >= 0 and stone_price_default_dong >= 0
    and (labor_final_dong is null or labor_final_dong >= 0)
    and (gold_amount_dong is null or gold_amount_dong >= 0)
  );

comment on column public.pos_sale_items.gold_amount_dong is 'Giá vàng / 1 chiếc lúc bán (bảng giá × TL vàng + điều chỉnh/chỉ). Null = dòng trước Phase 4.';
comment on column public.pos_sale_items.stone_weight_chi is 'TL đá / 1 chiếc (snapshot SKU).';
comment on column public.pos_sale_items.stone_price_dong is 'Giá đá / 1 chiếc thực tế khi bán (đã sửa nếu có).';
comment on column public.pos_sale_items.stone_price_default_dong is 'Giá đá / 1 chiếc mặc định của SKU lúc bán.';
comment on column public.pos_sale_items.labor_fee_dong is 'Tiền công gốc / 1 chiếc (SKU) lúc bán.';
comment on column public.pos_sale_items.labor_adjust_dong is 'Điều chỉnh tiền công / 1 chiếc (+/-).';
comment on column public.pos_sale_items.labor_final_dong is 'Tiền công thực tế / 1 chiếc = gốc + điều chỉnh (>= 0). Null = dòng trước Phase 4.';

-- 2. Dòng giá vàng thị trường theo nhóm (cùng quy tắc pos_market_gold_class_prices)
create or replace function pos_private.market_gold_price_row(p_class text)
returns table (price_row_id text, sell numeric)
language sql
stable
security definer
set search_path to ''
as $function$
  select g.id, g.sell
  from public.gold_price_rows g
  where (
      upper(coalesce(g.brand, '')) like '%THỊ TRƯỜNG%'
      or upper(coalesce(g.brand, '')) like '%THI TRUONG%'
      or upper(coalesce(g.product, '')) like '%THỊ TRƯỜNG%'
    )
    and nullif(trim(coalesce(g.purity, '')), '') is not null
    and pos_private.market_gold_class_from(null, g.purity) = p_class
  order by g.sort_order
  limit 1;
$function$;

-- 3. Giá vàng / 1 chiếc tại thời điểm bán (không gồm đá, công)
create or replace function pos_private.compute_gold_unit(p_sku public.pos_skus)
returns table (gold_unit_dong bigint, gold_sell_dong bigint, price_row_id text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_sell numeric;
  v_row text;
  v_class text;
  v_board numeric := coalesce(nullif(p_sku.board_unit_chi, 0), 1);
begin
  if coalesce(p_sku.is_market_gold, false) then
    v_class := pos_private.market_gold_class(p_sku.id);
    select r.price_row_id, r.sell into v_row, v_sell from pos_private.market_gold_price_row(v_class) r;
    if v_row is null or v_sell is null or v_sell <= 0 then
      raise exception 'Nhóm vàng thị trường % chưa có giá bán trên bảng giá. Cập nhật giá bán trước khi bán.',
        case v_class when '9999' then '999.9' when '999' then '99.9' when '9' then '9 (vàng tây)' when 'SILVER' then 'Bạc' else v_class end
        using errcode = 'P0001';
    end if;
  else
    if p_sku.price_row_id is null then
      raise exception 'SKU % chưa gắn bảng giá', p_sku.sku using errcode = 'P0001';
    end if;
    v_row := p_sku.price_row_id;
    select r.sell into v_sell from public.gold_price_rows r where r.id = p_sku.price_row_id;
    if v_sell is null then
      raise exception 'Không tìm thấy dòng giá cho SKU %', p_sku.sku using errcode = 'P0001';
    end if;
    if v_sell <= 0 then
      raise exception 'Giá bán trên bảng giá không hợp lệ cho SKU %', p_sku.sku using errcode = 'P0001';
    end if;
  end if;

  gold_unit_dong := (round(v_sell * p_sku.weight_chi / v_board))::bigint;
  gold_sell_dong := round(v_sell)::bigint;
  price_row_id := v_row;
  return next;
end;
$function$;

-- 4. Giá niêm yết / 1 chiếc = vàng + công mặc định + đá mặc định (đơn tạm, tham chiếu dòng bán)
create or replace function pos_private.compute_unit_price(p_sku public.pos_skus)
returns table (unit_price_dong bigint, gold_sell_dong bigint)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_gold record;
begin
  select * into v_gold from pos_private.compute_gold_unit(p_sku);
  unit_price_dong := v_gold.gold_unit_dong
    + coalesce(p_sku.labor_fee_dong, 0)
    + coalesce(p_sku.stone_price_dong, 0);
  gold_sell_dong := v_gold.gold_sell_dong;
  return next;
end;
$function$;

revoke all on function pos_private.market_gold_price_row(text) from public, anon, authenticated;
revoke all on function pos_private.compute_gold_unit(public.pos_skus) from public, anon, authenticated;

-- 5. SKU vàng thị trường đã nấu: TL vàng = KL sau nấu (giá bán C5 tính theo TL vàng)
with drift as (
  select s.id, s.sku, s.weight_chi as before_chi, bi.weight_after_chi as after_chi
  from public.pos_skus s
  join public.pos_buy_items bi on bi.sku_id = s.id
  where s.is_market_gold
    and bi.weight_after_chi is not null
    and bi.weight_after_chi > 0
    and s.weight_chi <> bi.weight_after_chi
), upd as (
  update public.pos_skus s
  set weight_chi = d.after_chi
  from drift d
  where s.id = d.id
  returning d.sku, d.before_chi, d.after_chi
)
insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
select 'system:migration', 'SKU_WEIGHT_SYNC', 'pos_sku', null,
  'P4: TL SKU vàng thị trường = KL sau nấu của phiếu mua',
  jsonb_build_object('rows', jsonb_agg(jsonb_build_object('sku', sku, 'before', before_chi, 'after', after_chi)))
from upd
having count(*) > 0;

-- 6. complete_sale: tách giá vàng / đá / công, lưu snapshot từng thành phần
CREATE OR REPLACE FUNCTION pos_private.complete_sale(p_idempotency_key text, p_customer_name text, p_customer_phone text, p_payment_method text, p_items jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_paid_dong bigint DEFAULT NULL::bigint, p_due_date date DEFAULT NULL::date, p_charges jsonb DEFAULT '[]'::jsonb, p_operator_staff_id uuid DEFAULT NULL::uuid, p_pickup_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_payment_splits jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor text;
  v_cached jsonb;
  v_customer_id uuid;
  v_sale_id uuid;
  v_sale_no text;
  v_invoice_id uuid;
  v_invoice_no text;
  v_item record;
  v_charge record;
  v_sku public.pos_skus%rowtype;
  v_gold record;
  v_total bigint := 0;
  v_sku_ids uuid[];
  v_stock integer;
  v_result jsonb;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date := p_due_date;
  v_operator uuid;
  v_tx_type text := 'SALE';
  v_fulfill text := 'DELIVERED';
  v_any_short boolean := false;
  v_adj bigint;
  v_gold_unit bigint;
  v_stone_default bigint;
  v_stone_unit bigint;
  v_labor_base bigint;
  v_labor_adj bigint;
  v_labor_final bigint;
  v_actual_unit bigint;
  v_line_total bigint;
  v_line_edits jsonb := '[]'::jsonb;
  v_today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_pickup timestamptz := p_pickup_due_at;
  v_charge_name text;
  v_deposit_wf text := null;
  v_avail integer;
  v_item_status text;
  v_split record;
  v_split_sum bigint := 0;
  v_sale_method text := p_payment_method;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_sale');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    v_operator := pos_private.resolve_operator_staff_id(p_operator_staff_id);

    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD', 'MIXED') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Giỏ hàng trống' using errcode = '22023';
    end if;

    select array_agg(x.sku_id order by x.sku_id) into v_sku_ids
    from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint);

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
      group by x.sku_id having count(*) > 1
    ) then
      raise exception 'SKU trùng trong giỏ hàng' using errcode = '22023';
    end if;

    perform s.sku_id
    from public.pos_inventory_stock s
    where s.sku_id = any(v_sku_ids)
    order by s.sku_id
    for update;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
    loop
      if v_item.quantity is null or v_item.quantity <= 0 then
        raise exception 'Số lượng bán phải > 0' using errcode = '22023';
      end if;
      select quantity into v_stock from public.pos_inventory_stock where sku_id = v_item.sku_id;
      if v_stock is null then
        raise exception 'SKU không tồn tại trên sổ kho' using errcode = 'P0001';
      end if;
      if v_stock < v_item.quantity then
        v_any_short := true;
      end if;
    end loop;

    if v_any_short then
      v_tx_type := 'PREORDER';
      v_fulfill := 'UNFULFILLED';
      if v_pickup is null then
        raise exception 'Đơn đặt hàng phải có ngày giờ hẹn lấy hàng' using errcode = '22023';
      end if;
      if v_pickup < now() then
        raise exception 'Hẹn lấy hàng không được trước thời điểm đặt' using errcode = '22023';
      end if;
    end if;

    if p_customer_id is not null then
      select c.id into v_customer_id from public.pos_customers c where c.id = p_customer_id;
      if v_customer_id is null then
        raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
      end if;
    else
      v_customer_id := pos_private.upsert_customer(p_customer_name, p_customer_phone);
    end if;

    if v_tx_type = 'PREORDER' then
      v_sale_no := 'PRE-' || lpad(nextval('public.pos_preorder_seq')::text, 6, '0');
      v_invoice_no := 'DH' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
    else
      v_sale_no := 'SALE-' || lpad(nextval('public.pos_sale_seq')::text, 6, '0');
      v_invoice_no := 'HD' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
    end if;

    insert into public.pos_sales (
      sale_no, customer_id, status, payment_method, total_dong,
      idempotency_key, actor_email, completed_at, note,
      transaction_type, operator_staff_id, pickup_due_at, fulfillment_status,
      deposit_workflow_status, deposit_price_locked
    ) values (
      v_sale_no, v_customer_id, 'COMPLETED', p_payment_method, 0,
      trim(p_idempotency_key), v_actor, now(), v_note,
      v_tx_type, v_operator, v_pickup, v_fulfill,
      null, true
    )
    returning id into v_sale_id;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(
        sku_id uuid,
        quantity integer,
        price_adjustment_per_chi bigint,
        stone_price_dong bigint,
        labor_adjust_dong bigint
      )
    loop
      v_sku := pos_private.require_saleable_sku(v_item.sku_id);
      if v_sku.weight_chi is null or v_sku.weight_chi <= 0 then
        raise exception 'Trọng lượng sản phẩm không hợp lệ' using errcode = '22023';
      end if;

      select * into v_gold from pos_private.compute_gold_unit(v_sku);
      v_adj := coalesce(v_item.price_adjustment_per_chi, 0);

      if not coalesce(v_sku.is_market_gold, false) then
        perform pos_private.assert_price_within_or_exception(
          round(v_gold.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint + v_adj,
          round(v_gold.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint,
          false, false, null
        );
      end if;

      v_gold_unit := v_gold.gold_unit_dong + round(v_adj * v_sku.weight_chi)::bigint;
      if v_gold_unit < 0 then
        raise exception 'Giá giao dịch không hợp lệ' using errcode = '22023';
      end if;

      v_stone_default := coalesce(v_sku.stone_price_dong, 0);
      v_stone_unit := coalesce(v_item.stone_price_dong, v_stone_default);
      if v_stone_unit < 0 then
        raise exception 'Giá đá không hợp lệ' using errcode = '22023';
      end if;

      v_labor_base := coalesce(v_sku.labor_fee_dong, 0);
      v_labor_adj := coalesce(v_item.labor_adjust_dong, 0);
      v_labor_final := v_labor_base + v_labor_adj;
      if v_labor_final < 0 then
        raise exception 'Tiền công sau điều chỉnh không được nhỏ hơn 0 (%)', v_sku.sku using errcode = '22023';
      end if;

      v_actual_unit := v_gold_unit + v_stone_unit + v_labor_final;
      v_line_total := v_actual_unit * v_item.quantity;

      select quantity into v_stock from public.pos_inventory_stock where sku_id = v_item.sku_id;
      v_avail := least(greatest(coalesce(v_stock, 0), 0), v_item.quantity);
      if v_avail >= v_item.quantity then
        v_item_status := 'IN_STOCK';
      else
        v_item_status := 'BACKORDER';
      end if;

      insert into public.pos_sale_items (
        sale_id, sku_id, quantity, unit_price_dong, total_price_dong,
        gold_sell_dong, weight_chi, board_unit_chi, labor_fee_dong, price_row_id,
        product_name_snapshot, sku_snapshot, reference_unit_price_dong, price_adjustment_per_chi,
        qty_available_at_order, qty_delivered, item_status,
        gold_amount_dong, stone_weight_chi, stone_price_dong, stone_price_default_dong,
        labor_adjust_dong, labor_final_dong
      ) values (
        v_sale_id, v_sku.id, v_item.quantity, v_actual_unit, v_line_total,
        v_gold.gold_sell_dong, v_sku.weight_chi, v_sku.board_unit_chi,
        v_labor_base, coalesce(v_gold.price_row_id, v_sku.price_row_id, ''),
        v_sku.name, v_sku.sku, v_gold.gold_unit_dong + v_stone_default + v_labor_base, v_adj,
        v_avail, 0, v_item_status,
        v_gold_unit, coalesce(v_sku.stone_weight_chi, 0), v_stone_unit, v_stone_default,
        v_labor_adj, v_labor_final
      );

      if v_adj <> 0 then
        insert into public.pos_price_exceptions (
          transaction_type, transaction_id, line_id,
          reference_price_dong_per_chi, actual_price_dong_per_chi,
          difference_per_chi, weight_chi, reason, created_by
        )
        select
          'SALE', v_sale_id, si.id,
          round(v_gold.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint,
          round(v_gold.gold_sell_dong::numeric / v_sku.board_unit_chi)::bigint + v_adj,
          v_adj, v_sku.weight_chi,
          'Điều chỉnh giá POS ±300.000đ/chỉ', v_actor
        from public.pos_sale_items si
        where si.sale_id = v_sale_id and si.sku_id = v_sku.id
        order by si.id desc
        limit 1;
      end if;

      if v_stone_unit <> v_stone_default or v_labor_adj <> 0 then
        v_line_edits := v_line_edits || jsonb_build_array(jsonb_build_object(
          'sku', v_sku.sku,
          'stone_price_default_dong', v_stone_default,
          'stone_price_dong', v_stone_unit,
          'labor_fee_dong', v_labor_base,
          'labor_adjust_dong', v_labor_adj,
          'labor_final_dong', v_labor_final
        ));
      end if;

      v_total := v_total + v_line_total;
    end loop;

    if p_charges is not null and jsonb_typeof(p_charges) = 'array' then
      for v_charge in
        select * from jsonb_to_recordset(p_charges) as x(name text, amount_dong bigint, reason text)
      loop
        v_charge_name := nullif(trim(coalesce(v_charge.name, '')), '');
        if v_charge_name is null then
          raise exception 'Khoản phải thu phải có tên' using errcode = '22023';
        end if;
        if v_charge.amount_dong is null or v_charge.amount_dong <= 0 then
          raise exception 'Số tiền khoản phải thu phải > 0' using errcode = '22023';
        end if;
        insert into public.pos_sale_charges (sale_id, name, amount_dong, reason, created_by)
        values (
          v_sale_id, v_charge_name, v_charge.amount_dong,
          nullif(trim(coalesce(v_charge.reason, '')), ''), v_actor
        );
        v_total := v_total + v_charge.amount_dong;
      end loop;
    end if;

    v_paid := coalesce(p_paid_dong, v_total);
    if v_paid < 0 then
      raise exception 'Số tiền thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if v_paid > v_total then
      raise exception 'Số tiền thanh toán vượt tổng đơn' using errcode = '22023';
    end if;
    v_remaining := v_total - v_paid;
    if v_remaining > 0 then
      if v_due is null then
        raise exception 'Đơn còn nợ phải có ngày hẹn trả' using errcode = '22023';
      end if;
      if v_due < v_today then
        raise exception 'Ngày hẹn thanh toán không được trong quá khứ' using errcode = '22023';
      end if;
    else
      v_due := null;
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_total, v_due);

    if v_tx_type = 'SALE' and (v_remaining > 0 or v_pickup is not null) then
      v_tx_type := 'DEPOSIT';
      v_fulfill := 'UNFULFILLED';
      v_deposit_wf := 'AWAITING_AGREEMENT';
      if v_pickup is null then
        raise exception 'Đặt cọc / giữ vàng phải có thời gian dự kiến giao vàng' using errcode = '22023';
      end if;
      if v_pickup < now() then
        raise exception 'Thời gian dự kiến giao vàng không được trước thời điểm đặt' using errcode = '22023';
      end if;
      v_sale_no := 'PRE-' || lpad(nextval('public.pos_preorder_seq')::text, 6, '0');
      v_invoice_no := 'DH' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
    elsif v_tx_type = 'PREORDER' and v_remaining > 0 then
      v_deposit_wf := 'AWAITING_AGREEMENT';
    elsif v_tx_type = 'SALE' then
      v_pickup := null;
    end if;

    update public.pos_sales
    set
      sale_no = v_sale_no,
      total_dong = v_total,
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due,
      transaction_type = v_tx_type,
      fulfillment_status = v_fulfill,
      pickup_due_at = v_pickup,
      deposit_workflow_status = v_deposit_wf
    where id = v_sale_id;

    insert into public.pos_invoices (
      invoice_no, sale_id, customer_id, status, total_dong, issued_at, actor_email
    ) values (
      v_invoice_no, v_sale_id, v_customer_id, 'ISSUED', v_total, now(), v_actor
    )
    returning id into v_invoice_id;

    if v_paid > 0 then
      if p_payment_splits is not null
         and jsonb_typeof(p_payment_splits) = 'array'
         and jsonb_array_length(p_payment_splits) > 0 then
        for v_split in
          select * from jsonb_to_recordset(p_payment_splits) as x(method text, amount_dong bigint)
        loop
          if v_split.method not in ('CASH', 'TRANSFER') then
            raise exception 'Hình thức thanh toán không hợp lệ' using errcode = '22023';
          end if;
          if v_split.amount_dong is null or v_split.amount_dong <= 0 then
            raise exception 'Số tiền theo hình thức phải > 0' using errcode = '22023';
          end if;
          v_split_sum := v_split_sum + v_split.amount_dong;
          insert into public.pos_sale_payments (
            sale_id, amount_dong, payment_method, paid_at, actor_email, note,
            idempotency_key, received_by_staff_id
          ) values (
            v_sale_id, v_split.amount_dong, v_split.method, now(), v_actor,
            case
              when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán'
              else 'Thanh toán lúc bán'
            end,
            'sale-open:' || trim(p_idempotency_key) || ':' || v_split.method,
            v_operator
          );
        end loop;
        if v_split_sum <> v_paid then
          raise exception 'Tổng các khoản thanh toán phải khớp số tiền thu' using errcode = '22023';
        end if;
        if (
          select count(distinct x.method)
          from jsonb_to_recordset(p_payment_splits) as x(method text, amount_dong bigint)
        ) > 1 then
          v_sale_method := 'MIXED';
        else
          select x.method into v_sale_method
          from jsonb_to_recordset(p_payment_splits) as x(method text, amount_dong bigint)
          limit 1;
        end if;
        update public.pos_sales
        set payment_method = v_sale_method
        where id = v_sale_id;
      else
        if p_payment_method = 'MIXED' then
          raise exception 'Thanh toán hỗn hợp cần tách số tiền từng hình thức' using errcode = '22023';
        end if;
        insert into public.pos_sale_payments (
          sale_id, amount_dong, payment_method, paid_at, actor_email, note,
          idempotency_key, received_by_staff_id
        ) values (
          v_sale_id, v_paid, p_payment_method, now(), v_actor,
          case
            when v_deposit_wf is not null then 'Tiền đặt cọc lúc bán'
            else 'Thanh toán lúc bán'
          end,
          'sale-open:' || trim(p_idempotency_key),
          v_operator
        );
      end if;
    end if;

    if v_tx_type = 'SALE' then
      for v_item in
        select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer, price_adjustment_per_chi bigint)
      loop
        perform pos_private.apply_stock_change(
          v_item.sku_id, - v_item.quantity,
          'SALE', 'Bán hàng', 'SALE', v_sale_id, v_actor
        );
      end loop;
      update public.pos_sale_items
      set qty_delivered = quantity, item_status = 'DELIVERED'
      where sale_id = v_sale_id;
    else
      perform pos_private.sync_sale_fulfillment_header(v_sale_id);
    end if;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor,
      case
        when v_tx_type = 'PREORDER' then 'PREORDER_CREATE'
        when v_tx_type = 'DEPOSIT' then 'DEPOSIT_CREATE'
        else 'SALE'
      end,
      'sale', v_sale_id,
      case
        when v_tx_type = 'PREORDER' then 'Tạo đơn đặt hàng'
        when v_tx_type = 'DEPOSIT' then 'Tạo đơn đặt cọc / TT một phần'
        else 'Bán hàng'
      end,
      jsonb_build_object(
        'sale_no', v_sale_no,
        'invoice_no', v_invoice_no,
        'invoice_id', v_invoice_id,
        'customer_id', v_customer_id,
        'total_dong', v_total,
        'paid_dong', v_paid,
        'remaining_dong', v_remaining,
        'payment_status', v_pay_status,
        'due_date', v_due,
        'transaction_type', v_tx_type,
        'fulfillment_status', v_fulfill,
        'pickup_due_at', v_pickup,
        'deposit_workflow_status', v_deposit_wf,
        'payment_method', v_sale_method,
        'operator_staff_id', v_operator,
        'login_account', v_actor,
        'line_edits', v_line_edits
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'sale_id', v_sale_id,
      'sale_no', v_sale_no,
      'invoice_id', v_invoice_id,
      'invoice_no', v_invoice_no,
      'customer_id', v_customer_id,
      'total_dong', v_total,
      'paid_dong', v_paid,
      'remaining_dong', v_remaining,
      'payment_status', v_pay_status,
      'due_date', v_due,
      'status', 'COMPLETED',
      'transaction_type', v_tx_type,
      'fulfillment_status', (
        select fulfillment_status from public.pos_sales where id = v_sale_id
      ),
      'pickup_due_at', v_pickup,
      'deposit_workflow_status', v_deposit_wf,
      'payment_method', v_sale_method,
      'operator_staff_id', v_operator
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;
