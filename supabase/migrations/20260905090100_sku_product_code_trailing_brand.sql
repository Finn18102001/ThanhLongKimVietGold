-- Refine product abbrev: only strip trailing brand-name overlap (not every shared word).

create or replace function public.tlkv_sku_product_code(p_name text, p_brand_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
  v_brand_name text;
  v_brand_parts text[];
  v_prod_parts text[];
  v_code text := '';
  v_i integer;
  v_j integer;
  v_match integer;
  v_word text;
begin
  v_name := lower(public.tlkv_sku_strip_diacritics(coalesce(p_name, '')));
  v_name := regexp_replace(v_name, '[0-9]+([.,][0-9]+)?[[:space:]]*chi', ' ', 'gi');
  v_name := regexp_replace(v_name, '[^a-z0-9]+', ' ', 'g');
  v_name := trim(both from regexp_replace(v_name, '[[:space:]]+', ' ', 'g'));

  select b.name into v_brand_name from public.brands b where b.id = p_brand_id;
  v_brand_parts := string_to_array(
    trim(both from regexp_replace(
      regexp_replace(lower(public.tlkv_sku_strip_diacritics(coalesce(v_brand_name, ''))), '[^a-z0-9]+', ' ', 'g'),
      '[[:space:]]+', ' ', 'g'
    )),
    ' '
  );

  v_prod_parts := string_to_array(v_name, ' ');

  if coalesce(array_length(v_prod_parts, 1), 0) > 0
     and coalesce(array_length(v_brand_parts, 1), 0) > 0 then
    v_match := 0;
    v_i := array_length(v_prod_parts, 1);
    v_j := array_length(v_brand_parts, 1);
    while v_i >= 1 and v_j >= 1 and v_prod_parts[v_i] = v_brand_parts[v_j] loop
      v_match := v_match + 1;
      v_i := v_i - 1;
      v_j := v_j - 1;
    end loop;
    if v_match > 0 and v_match < coalesce(array_length(v_prod_parts, 1), 0) then
      v_prod_parts := v_prod_parts[1:array_length(v_prod_parts, 1) - v_match];
    end if;
  end if;

  if coalesce(array_length(v_prod_parts, 1), 0) = 0 then
    return 'sp';
  end if;

  if array_length(v_prod_parts, 1) = 1 then
    return left(v_prod_parts[1], 6);
  end if;

  foreach v_word in array v_prod_parts loop
    if v_word is null or v_word = '' then
      continue;
    end if;
    v_code := v_code || left(v_word, 1);
    exit when length(v_code) >= 6;
  end loop;

  return coalesce(nullif(v_code, ''), 'sp');
end;
$$;

do $$
declare
  r public.products%rowtype;
begin
  for r in select p.* from public.products p loop
    perform public.tlkv_sync_pos_sku_from_product(r);
  end loop;
end;
$$;
