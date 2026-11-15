-- Refine tlkv_board_unit_chi: digit+comma weight lists stay 1; name commas with one "X chỉ" keep denom.
-- Companion to 20261115120000. No new tables → §32.1 N/A.

create or replace function public.tlkv_board_unit_chi(p_product text)
returns numeric
language plpgsql
immutable
as $function$
declare
  v text := btrim(coalesce(p_product, ''));
  n int;
  m text[];
  parsed numeric;
begin
  if v = '' then
    return 1;
  end if;

  -- Weight-list boards ("0.5, 1, 2, 3 chỉ"): digit then comma → giá/chỉ (=1).
  -- Name commas without a preceding weight digit stay denominations:
  -- "Bông Lúa Vàng, Hạt Gạo Vàng 0.1 chỉ".
  if v ~* '\d+(?:[.,]\d+)?\s*,' then
    return 1;
  end if;

  select count(*) into n
  from regexp_matches(v, '(\d+(?:[.,]\d+)?)\s*ch[ỉi]', 'gi');
  if n <> 1 then
    return 1;
  end if;

  m := regexp_match(v, '(\d+(?:[.,]\d+)?)\s*ch[ỉi]', 'i');
  if m is null or m[1] is null then
    return 1;
  end if;

  parsed := round(replace(m[1], ',', '.')::numeric, 5);
  if parsed is null or parsed <= 0 then
    return 1;
  end if;
  return parsed;
end;
$function$;
