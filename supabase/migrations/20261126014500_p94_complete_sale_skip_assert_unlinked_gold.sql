-- P9.4: unlinked GOLD manual has gold_sell_dong=0 — skip ±300k board assert (no board).

do $bak$
begin
  create table if not exists tlkv_backup_20261110._routines_p94_complete_sale_assert (
    captured_at timestamptz not null default now(),
    definition text not null
  );
  insert into tlkv_backup_20261110._routines_p94_complete_sale_assert (definition)
  select pg_get_functiondef('pos_private.complete_sale(text,text,text,text,jsonb,uuid,text,bigint,date,jsonb,uuid,timestamptz,jsonb)'::regprocedure);
end;
$bak$;

do $p$
declare
  def text;
  old text := $o$
      else
        if not coalesce(v_sku.is_market_gold, false) then
          perform pos_private.assert_price_within_or_exception(
$o$;
  new text := $n$
      else
        -- P9.4: no board sell for unlinked GOLD manual — skip ±300k/chỉ assert.
        if not coalesce(v_sku.is_market_gold, false)
           and coalesce(v_gold.gold_sell_dong, 0) > 0 then
          perform pos_private.assert_price_within_or_exception(
$n$;
begin
  def := pg_get_functiondef(
    'pos_private.complete_sale(text,text,text,text,jsonb,uuid,text,bigint,date,jsonb,uuid,timestamptz,jsonb)'::regprocedure
  );
  if position('coalesce(v_gold.gold_sell_dong, 0) > 0 then' in def) > 0 then
    raise notice 'P9.4 complete_sale assert skip already present';
    return;
  end if;
  if position(old in def) = 0 then
    raise exception 'P9.4: complete_sale assert anchor not found';
  end if;
  def := replace(def, old, new);
  execute def;
end;
$p$;
