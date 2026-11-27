-- Sync TLKV Blue Gold Birthday Cake POS SKU price link → Trang Sức Vàng Ta (TLKV) 99,99
-- Target: gold_price_rows.id = r-1775875831069 (purity 99,99)
-- Catalog products.price_row_id already correct; pos_skus still on 99,9 (r-1775875789839).
-- No new tables → §32.1 N/A. Historical buys/sales snapshots unchanged.

create table if not exists tlkv_backup_20261110.fix_birthday_cake_price_link_20261126 as
select
  'pos_skus'::text as src,
  s.id::text as id,
  s.sku,
  s.name,
  s.catalog_product_id,
  s.price_row_id,
  s.weight_chi,
  s.board_unit_chi,
  timezone('utc', now()) as snapped_at
from public.pos_skus s
where s.id = 'db87efc9-42a0-4e27-bf1f-6541f4c7ca21'
   or s.sku = 'tlkv-tbgbc-0.1'
union all
select
  'products',
  p.id::text,
  null,
  p.name,
  p.id,
  p.price_row_id,
  p.weight,
  null,
  timezone('utc', now())
from public.products p
where p.id = 'abda9671-fd85-49f7-89fa-9a50ad611c67';

do $$
declare
  v_sku_id uuid := 'db87efc9-42a0-4e27-bf1f-6541f4c7ca21';
  v_product_id text := 'abda9671-fd85-49f7-89fa-9a50ad611c67';
  v_target text := 'r-1775875831069';
  v_before text;
  v_sku text;
begin
  -- Keep catalog on 99,99 (idempotent). price_source is generated — do not set.
  update public.products p
  set
    price_row_id = v_target,
    price_source_product = 'Trang Sức Vàng Ta'
  where p.id = v_product_id
    and (
      p.price_row_id is distinct from v_target
      or coalesce(p.price_source_product, '') is distinct from 'Trang Sức Vàng Ta'
    );

  select s.price_row_id, s.sku
  into v_before, v_sku
  from public.pos_skus s
  where s.id = v_sku_id
  for update;

  if v_before is null and v_sku is null then
    raise exception 'SKU Birthday Cake not found';
  end if;

  if v_before is distinct from v_target then
    update public.pos_skus s
    set price_row_id = v_target
    where s.id = v_sku_id;

    insert into public.pos_audit_log (
      action,
      actor_email,
      entity_type,
      entity_id,
      reason,
      payload
    ) values (
      'SKU_PRICE_ROW_SYNC',
      'system@migration',
      'SKU',
      v_sku_id,
      'Đồng bộ link giá Birthday Cake → Trang Sức Vàng Ta 99,99',
      jsonb_build_object(
        'sku', v_sku,
        'before_price_row_id', v_before,
        'after_price_row_id', v_target,
        'target_purity', '99,99',
        'target_product', 'Trang Sức Vàng Ta',
        'migration', '20261126154500_sync_birthday_cake_price_row_9999'
      )
    );
  end if;
end;
$$;
