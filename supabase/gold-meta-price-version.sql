-- Cache-bust token for public gold prices.
-- Bumped on any gold_price_rows write so a reloaded tab can detect stale session cache.

alter table public.gold_meta
  add column if not exists price_version bigint not null default 1;

comment on column public.gold_meta.price_version is
  'Monotonic cache-bust token. Statement trigger on gold_price_rows increments this.';

create or replace function public.tlkv_bump_gold_price_version()
returns trigger
language plpgsql
as $$
begin
  update public.gold_meta
  set price_version = coalesce(price_version, 0) + 1,
      updated_at = now()
  where id = 1;
  return null;
end;
$$;

drop trigger if exists gold_price_rows_bump_version on public.gold_price_rows;
create trigger gold_price_rows_bump_version
after insert or update or delete on public.gold_price_rows
for each statement
execute function public.tlkv_bump_gold_price_version();
