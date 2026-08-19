-- Customer directory aggregates + activity filter for list view.

create or replace function pos_private.customer_directory_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_new_30d integer := 0;
  v_spending bigint := 0;
  v_orders integer := 0;
begin
  perform pos_private.require_admin();

  select count(*)::integer
  into v_total
  from public.pos_customers c
  where not c.is_walk_in;

  select count(*)::integer
  into v_new_30d
  from public.pos_customers c
  where not c.is_walk_in
    and c.created_at >= now() - interval '30 days';

  select
    coalesce(sum(s.total_dong), 0)::bigint,
    count(*)::integer
  into v_spending, v_orders
  from public.pos_sales s
  join public.pos_customers c on c.id = s.customer_id
  where s.status = 'COMPLETED'
    and not c.is_walk_in;

  return jsonb_build_object(
    'total_customers', v_total,
    'new_customers_30d', v_new_30d,
    'total_spending_dong', v_spending,
    'total_orders', v_orders,
    'avg_order_dong', case when v_orders > 0 then (v_spending / v_orders)::bigint else 0 end
  );
end;
$$;

create or replace function public.pos_customer_directory_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pos_private.customer_directory_stats();
$$;

create or replace function pos_private.list_customers(
  p_query text default '',
  p_group text default null,
  p_sort text default 'newest',
  p_limit integer default 8,
  p_offset integer default 0,
  p_activity text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
  v_group text := nullif(trim(coalesce(p_group, '')), '');
  v_sort text := coalesce(nullif(trim(p_sort), ''), 'newest');
  v_activity text := nullif(trim(coalesce(p_activity, '')), '');
  v_limit integer := greatest(coalesce(p_limit, 8), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer := 0;
  v_items jsonb;
begin
  perform pos_private.require_admin();

  if v_group is not null and v_group not in ('RETAIL', 'MEMBER', 'LOYAL', 'VIP') then
    raise exception 'Nhóm khách không hợp lệ' using errcode = '22023';
  end if;
  if v_sort not in ('newest', 'name', 'total') then
    raise exception 'Kiểu sắp xếp không hợp lệ' using errcode = '22023';
  end if;
  if v_activity is not null and v_activity not in ('purchased', 'never') then
    raise exception 'Bộ lọc trạng thái không hợp lệ' using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.pos_customers c
  where not c.is_walk_in
    and (v_group is null or c.customer_group = v_group)
    and (
      v_q = ''
      or lower(c.name) like '%' || v_q || '%'
      or c.phone like '%' || v_q || '%'
      or lower(c.customer_no) like '%' || v_q || '%'
    )
    and (
      v_activity is null
      or (
        v_activity = 'purchased'
        and exists (
          select 1
          from public.pos_sales s
          where s.customer_id = c.id
            and s.status = 'COMPLETED'
        )
      )
      or (
        v_activity = 'never'
        and not exists (
          select 1
          from public.pos_sales s
          where s.customer_id = c.id
            and s.status = 'COMPLETED'
        )
      )
    );

  select coalesce(jsonb_agg(ranked.row_json order by ranked.ord), '[]'::jsonb)
  into v_items
  from (
    select
      pos_private.customer_json(c.id) as row_json,
      row_number() over (
        order by
          case when v_sort = 'name' then lower(c.name) end asc,
          case when v_sort = 'total' then (
            select coalesce(sum(s.total_dong), 0)
            from public.pos_sales s
            where s.customer_id = c.id and s.status = 'COMPLETED'
          ) end desc,
          case when v_sort = 'newest' then c.created_at end desc,
          c.name asc
      ) as ord
    from public.pos_customers c
    where not c.is_walk_in
      and (v_group is null or c.customer_group = v_group)
      and (
        v_q = ''
        or lower(c.name) like '%' || v_q || '%'
        or c.phone like '%' || v_q || '%'
        or lower(c.customer_no) like '%' || v_q || '%'
      )
      and (
        v_activity is null
        or (
          v_activity = 'purchased'
          and exists (
            select 1
            from public.pos_sales s
            where s.customer_id = c.id
              and s.status = 'COMPLETED'
          )
        )
        or (
          v_activity = 'never'
          and not exists (
            select 1
            from public.pos_sales s
            where s.customer_id = c.id
              and s.status = 'COMPLETED'
          )
        )
      )
  ) ranked
  where ranked.ord > v_offset
    and ranked.ord <= v_offset + v_limit;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

drop function if exists public.pos_list_customers(text, text, text, integer, integer);

create or replace function public.pos_list_customers(
  p_query text default '',
  p_group text default null,
  p_sort text default 'newest',
  p_limit integer default 8,
  p_offset integer default 0,
  p_activity text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pos_private.list_customers(p_query, p_group, p_sort, p_limit, p_offset, p_activity);
$$;

revoke all on function public.pos_customer_directory_stats() from public, anon;
grant execute on function public.pos_customer_directory_stats() to authenticated;

revoke all on function public.pos_list_customers(text, text, text, integer, integer, text) from public, anon;
grant execute on function public.pos_list_customers(text, text, text, integer, integer, text) to authenticated;
