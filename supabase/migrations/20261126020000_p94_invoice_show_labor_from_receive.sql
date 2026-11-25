-- P9.4 correction: show-labor-on-invoice is chosen at receive (SKU), snapshotted on sale line.
-- Presentation only; does not change money/stock.

do $bak$
begin
  create table if not exists tlkv_backup_20261110._routines_p94_invoice_show_labor (
    captured_at timestamptz not null default now(),
    schema_name text not null,
    proname text not null,
    definition text not null
  );
  insert into tlkv_backup_20261110._routines_p94_invoice_show_labor (schema_name, proname, definition)
  select n.nspname, p.proname, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pos_private'
    and p.proname = 'complete_sale'
    and pg_get_function_identity_arguments(p.oid) =
      'p_idempotency_key text, p_customer_name text, p_customer_phone text, p_payment_method text, p_items jsonb, p_customer_id uuid, p_note text, p_paid_dong bigint, p_due_date date, p_charges jsonb, p_operator_staff_id uuid, p_pickup_due_at timestamp with time zone, p_payment_splits jsonb';
end;
$bak$;

alter table public.pos_skus
  add column if not exists invoice_show_labor_line boolean not null default true;

comment on column public.pos_skus.invoice_show_labor_line is
  'P9.4: set at receive — when true, print separate labor row on sales invoice; money unchanged.';

alter table public.pos_sale_items
  add column if not exists invoice_show_labor_line boolean;

comment on column public.pos_sale_items.invoice_show_labor_line is
  'Snapshot from pos_skus at sale. Null = legacy (treat as true).';

-- Existing tables already granted; restate for clarity after ALTER (§32.1).
grant select, insert, update, delete on public.pos_skus to authenticated;
grant select, insert, update, delete on public.pos_skus to service_role;
grant select, insert, update, delete on public.pos_sale_items to authenticated;
grant select, insert, update, delete on public.pos_sale_items to service_role;

create or replace function public.pos_set_sku_invoice_show_labor(
  p_sku_id uuid,
  p_show boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_sku_id is null then
    raise exception 'Thiếu sku_id' using errcode = 'P0001';
  end if;
  update public.pos_skus
  set invoice_show_labor_line = coalesce(p_show, true)
  where id = p_sku_id;
  if not found then
    raise exception 'Không tìm thấy SKU' using errcode = 'P0001';
  end if;
end;
$function$;

revoke all on function public.pos_set_sku_invoice_show_labor(uuid, boolean) from public, anon;
grant execute on function public.pos_set_sku_invoice_show_labor(uuid, boolean)
  to authenticated, service_role;

do $p$
declare
  def text;
  old text := $o$
      insert into public.pos_sale_items (
        sale_id, sku_id, quantity, unit_price_dong, total_price_dong,
        gold_sell_dong, weight_chi, board_unit_chi, labor_fee_dong, price_row_id,
        product_name_snapshot, sku_snapshot, reference_unit_price_dong, price_adjustment_per_chi,
        qty_available_at_order, qty_delivered, item_status,
        gold_amount_dong, stone_weight_chi, stone_price_dong, stone_price_default_dong,
        labor_adjust_dong, labor_final_dong,
        stone_quantity, stone_unit_price_dong
      ) values (
        v_sale_id, v_sku.id, v_item.quantity, v_actual_unit, v_line_total,
        v_gold.gold_sell_dong, v_sku.weight_chi, v_sku.board_unit_chi,
        v_labor_base, coalesce(v_gold.price_row_id, v_sku.price_row_id, ''),
        v_sku.name, v_sku.sku, v_gold.gold_unit_dong + v_stone_default + v_labor_base, v_adj,
        v_avail, 0, v_item_status,
        v_gold_unit, coalesce(v_sku.stone_weight_chi, 0), v_stone_unit, v_stone_default,
        v_labor_adj, v_labor_final,
        v_stone_qty, v_stone_unit_price
      );
$o$;
  new text := $n$
      insert into public.pos_sale_items (
        sale_id, sku_id, quantity, unit_price_dong, total_price_dong,
        gold_sell_dong, weight_chi, board_unit_chi, labor_fee_dong, price_row_id,
        product_name_snapshot, sku_snapshot, reference_unit_price_dong, price_adjustment_per_chi,
        qty_available_at_order, qty_delivered, item_status,
        gold_amount_dong, stone_weight_chi, stone_price_dong, stone_price_default_dong,
        labor_adjust_dong, labor_final_dong,
        stone_quantity, stone_unit_price_dong,
        invoice_show_labor_line
      ) values (
        v_sale_id, v_sku.id, v_item.quantity, v_actual_unit, v_line_total,
        v_gold.gold_sell_dong, v_sku.weight_chi, v_sku.board_unit_chi,
        v_labor_base, coalesce(v_gold.price_row_id, v_sku.price_row_id, ''),
        v_sku.name, v_sku.sku, v_gold.gold_unit_dong + v_stone_default + v_labor_base, v_adj,
        v_avail, 0, v_item_status,
        v_gold_unit, coalesce(v_sku.stone_weight_chi, 0), v_stone_unit, v_stone_default,
        v_labor_adj, v_labor_final,
        v_stone_qty, v_stone_unit_price,
        coalesce(v_sku.invoice_show_labor_line, true)
      );
$n$;
begin
  def := pg_get_functiondef(
    'pos_private.complete_sale(text,text,text,text,jsonb,uuid,text,bigint,date,jsonb,uuid,timestamptz,jsonb)'::regprocedure
  );
  if position('invoice_show_labor_line' in def) > 0
     and position('coalesce(v_sku.invoice_show_labor_line, true)' in def) > 0 then
    raise notice 'P9.4 sale snapshot invoice_show_labor_line already present';
    return;
  end if;
  if position(old in def) = 0 then
    raise exception 'P9.4: complete_sale sale_items insert anchor not found';
  end if;
  def := replace(def, old, new);
  execute def;
end;
$p$;
