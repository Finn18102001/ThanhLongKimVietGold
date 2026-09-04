-- SKU code rule: [brand]-[product]-[weight], lowercase, no diacritics, unique.
-- Replaces TK-<uuid> generation. Market-gold SKUs (MG-*) stay unchanged.

create or replace function public.tlkv_sku_strip_diacritics(p_text text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(p_text, ''),
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ'
      || 'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
      || 'AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'
  );
$$;

create or replace function public.tlkv_sku_brand_code(p_brand_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_parts text[];
  v_code text := '';
  v_part text;
begin
  if p_brand_id is null then
    return 'xx';
  end if;

  select lower(trim(coalesce(b.slug, ''))) into v_slug
  from public.brands b
  where b.id = p_brand_id;

  if v_slug is null or v_slug = '' then
    return 'xx';
  end if;

  -- Known stable abbreviations (examples in product brief).
  if v_slug = 'thang-long-kim-viet' then
    return 'tlkv';
  elsif v_slug = 'bao-tin-minh-chau' then
    return 'btmc';
  elsif v_slug = 'bao-tin-manh-hai' then
    return 'btmh';
  elsif v_slug = 'vang-thi-truong' then
    return 'vtt';
  elsif v_slug = 'bac' then
    return 'bac';
  end if;

  v_parts := string_to_array(v_slug, '-');
  if array_length(v_parts, 1) = 1 then
    return left(regexp_replace(v_parts[1], '[^a-z0-9]', '', 'g'), 6);
  end if;

  foreach v_part in array v_parts loop
    if length(v_part) > 0 then
      v_code := v_code || left(v_part, 1);
    end if;
  end loop;

  if length(v_code) < 2 then
    v_code := left(regexp_replace(v_slug, '[^a-z0-9]', '', 'g'), 6);
  end if;

  return coalesce(nullif(v_code, ''), 'xx');
end;
$$;

create or replace function public.tlkv_sku_weight_token(p_weight numeric)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  if p_weight is null or p_weight <= 0 then
    return '0';
  end if;
  v := trim(both from to_char(p_weight, 'FM999999990.999999'));
  if position('.' in v) > 0 then
    v := regexp_replace(v, '0+$', '');
    v := regexp_replace(v, '\.$', '');
  end if;
  return coalesce(nullif(v, ''), '0');
end;
$$;

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
  -- Drop weight phrases: "0.1 chi", "10 chi", ...
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

  -- Strip only trailing brand overlap (e.g. "Nhan Tron Kim Viet" + brand "... Kim Viet").
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

create or replace function public.tlkv_sku_allocate_unique(
  p_base text,
  p_exclude_sku_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_candidate text;
  v_n integer := 2;
begin
  v_candidate := lower(trim(both '-' from regexp_replace(coalesce(p_base, ''), '-{2,}', '-', 'g')));
  if v_candidate is null or v_candidate = '' then
    v_candidate := 'sp-0';
  end if;

  while exists (
    select 1
    from public.pos_skus s
    where s.sku = v_candidate
      and (p_exclude_sku_id is null or s.id is distinct from p_exclude_sku_id)
  ) loop
    v_candidate := p_base || '-' || v_n::text;
    v_n := v_n + 1;
    if v_n > 9999 then
      v_candidate := p_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      exit;
    end if;
  end loop;

  return v_candidate;
end;
$$;

create or replace function public.tlkv_build_pos_sku_code(
  p_name text,
  p_brand_id uuid,
  p_weight numeric,
  p_exclude_sku_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text;
begin
  v_base :=
    public.tlkv_sku_brand_code(p_brand_id)
    || '-'
    || public.tlkv_sku_product_code(p_name, p_brand_id)
    || '-'
    || public.tlkv_sku_weight_token(p_weight);

  return public.tlkv_sku_allocate_unique(v_base, p_exclude_sku_id);
end;
$$;

create or replace function public.tlkv_sync_pos_sku_from_product(p public.products)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku_id uuid;
  v_price_row_id text;
  v_board_unit numeric(12, 4);
  v_sku_code text;
  v_weight numeric;
begin
  if p.id is null or nullif(trim(p.name), '') is null then
    return;
  end if;

  select
    g.id,
    case
      when g.product ~* '0\.1[[:space:]]*chỉ' then 0.1
      else 1.0
    end
  into v_price_row_id, v_board_unit
  from public.gold_price_rows g
  where g.sell > 0
    and length(trim(g.product)) > 0
    and (
      lower(replace(replace(trim(coalesce(p.price_source_product, '')), E'\n', ' '), '  ', ' '))
        like '%' || lower(trim(g.product)) || '%'
      or lower(p.name) like '%' || lower(trim(g.product)) || '%'
    )
  order by length(trim(g.product)) desc
  limit 1;

  v_weight := coalesce(nullif(p.weight, 0), 1);

  select s.id into v_sku_id
  from public.pos_skus s
  where s.catalog_product_id = p.id
  limit 1;

  v_sku_code := public.tlkv_build_pos_sku_code(p.name, p.brand_id, v_weight, v_sku_id);

  if v_sku_id is null then
    insert into public.pos_skus (
      sku, name, catalog_product_id, price_row_id, weight_chi, board_unit_chi,
      labor_fee_dong, brand_id, is_active
    ) values (
      v_sku_code,
      p.name,
      p.id,
      v_price_row_id,
      v_weight,
      coalesce(v_board_unit, 1),
      0,
      p.brand_id,
      coalesce(p.is_active, true)
    )
    returning id into v_sku_id;
  else
    update public.pos_skus s
    set
      sku = v_sku_code,
      name = p.name,
      price_row_id = coalesce(v_price_row_id, s.price_row_id),
      weight_chi = coalesce(nullif(p.weight, 0), s.weight_chi),
      board_unit_chi = coalesce(v_board_unit, s.board_unit_chi),
      brand_id = coalesce(p.brand_id, s.brand_id),
      is_active = coalesce(p.is_active, true)
    where s.id = v_sku_id
      and coalesce(s.is_market_gold, false) is not true;
  end if;

  insert into public.pos_inventory_stock (sku_id, quantity)
  values (v_sku_id, 0)
  on conflict (sku_id) do nothing;
end;
$$;

-- Backfill all catalog-linked (non market-gold) SKUs to the new code rule.
do $$
declare
  r public.products%rowtype;
begin
  for r in
    select p.*
    from public.products p
    where coalesce(p.is_active, true)
       or exists (
         select 1 from public.pos_skus s where s.catalog_product_id = p.id
       )
  loop
    perform public.tlkv_sync_pos_sku_from_product(r);
  end loop;
end;
$$;
