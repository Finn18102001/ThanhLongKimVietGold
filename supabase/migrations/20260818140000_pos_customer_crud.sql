-- Customer profile CRUD + POS sale may attach an existing customer.
-- Does not alter website catalog tables.

create sequence if not exists public.pos_customer_seq;

alter table public.pos_customers
  add column if not exists customer_no text,
  add column if not exists gender text,
  add column if not exists customer_group text not null default 'RETAIL',
  add column if not exists date_of_birth date,
  add column if not exists is_walk_in boolean not null default false;

alter table public.pos_sales
  add column if not exists note text;

update public.pos_customers
set customer_no = 'KH' || lpad(nextval('public.pos_customer_seq')::text, 6, '0')
where customer_no is null;

alter table public.pos_customers
  alter column customer_no set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pos_customers_no_unique'
  ) then
    alter table public.pos_customers
      add constraint pos_customers_no_unique unique (customer_no);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'pos_customers_gender_check'
  ) then
    alter table public.pos_customers
      add constraint pos_customers_gender_check
      check (gender is null or gender in ('MALE', 'FEMALE', 'OTHER'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'pos_customers_group_check'
  ) then
    alter table public.pos_customers
      add constraint pos_customers_group_check
      check (customer_group in ('RETAIL', 'MEMBER', 'LOYAL', 'VIP'));
  end if;
end
$$;

create unique index if not exists pos_customers_walk_in_idx
  on public.pos_customers (is_walk_in)
  where is_walk_in;

create index if not exists pos_customers_created_at_idx
  on public.pos_customers (created_at desc);

create index if not exists pos_customers_group_idx
  on public.pos_customers (customer_group);

create index if not exists pos_sales_customer_id_idx
  on public.pos_sales (customer_id, completed_at desc);

insert into public.pos_customers (
  customer_no, name, phone, customer_group, is_walk_in, note
)
select 'KH000000', 'Khách lẻ', 'WALKIN', 'RETAIL', true, 'Khách vãng lai tại quầy'
where not exists (
  select 1 from public.pos_customers c where c.is_walk_in
);

select setval(
  'public.pos_customer_seq',
  greatest(
    (select coalesce(max(nullif(regexp_replace(customer_no, '[^0-9]', '', 'g'), '')::int), 1) from public.pos_customers),
    1
  )
);

create or replace function pos_private.normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raw text := trim(coalesce(p_phone, ''));
  v_digits text;
begin
  if v_raw = '' then
    return '';
  end if;
  if upper(v_raw) = 'WALKIN' then
    return 'WALKIN';
  end if;
  v_digits := regexp_replace(v_raw, '[^0-9]', '', 'g');
  return v_digits;
end;
$$;

create or replace function pos_private.upsert_customer(p_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := pos_private.normalize_phone(p_phone);
begin
  if v_name = '' or v_phone = '' or v_phone = 'WALKIN' then
    raise exception 'Khách hàng cần tên và số điện thoại' using errcode = '22023';
  end if;
  if v_phone !~ '^[0-9]{9,11}$' then
    raise exception 'Số điện thoại không hợp lệ' using errcode = '22023';
  end if;

  select c.id into v_id
  from public.pos_customers c
  where c.phone = v_phone;

  if v_id is null then
    insert into public.pos_customers(name, phone, customer_no)
    values (
      v_name,
      v_phone,
      'KH' || lpad(nextval('public.pos_customer_seq')::text, 6, '0')
    )
    returning id into v_id;
  else
    update public.pos_customers
    set name = v_name, updated_at = now()
    where id = v_id
      and not is_walk_in;
  end if;

  return v_id;
end;
$$;

create or replace function pos_private.customer_json(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.pos_customers%rowtype;
  v_total bigint := 0;
  v_count integer := 0;
  v_last timestamptz;
begin
  select * into v_row from public.pos_customers where id = p_id;
  if v_row.id is null then
    return null;
  end if;

  select coalesce(sum(s.total_dong), 0), count(*), max(s.completed_at)
  into v_total, v_count, v_last
  from public.pos_sales s
  where s.customer_id = p_id
    and s.status = 'COMPLETED';

  return jsonb_build_object(
    'id', v_row.id,
    'customer_no', v_row.customer_no,
    'name', v_row.name,
    'phone', v_row.phone,
    'email', v_row.email,
    'address', v_row.address,
    'tax_code', v_row.tax_code,
    'note', v_row.note,
    'gender', v_row.gender,
    'customer_group', v_row.customer_group,
    'date_of_birth', v_row.date_of_birth,
    'is_walk_in', v_row.is_walk_in,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'total_dong', v_total,
    'sale_count', v_count,
    'debt_dong', 0,
    'last_activity_at', coalesce(v_last, v_row.updated_at)
  );
end;
$$;

create or replace function pos_private.create_customer(
  p_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_tax_code text,
  p_note text,
  p_gender text,
  p_customer_group text,
  p_date_of_birth date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := pos_private.normalize_phone(p_phone);
  v_group text := coalesce(nullif(trim(coalesce(p_customer_group, '')), ''), 'RETAIL');
  v_gender text := nullif(trim(coalesce(p_gender, '')), '');
begin
  v_actor := pos_private.require_admin();

  if v_name = '' then
    raise exception 'Khách hàng cần họ tên' using errcode = '22023';
  end if;
  if v_phone = '' or v_phone = 'WALKIN' or v_phone !~ '^[0-9]{9,11}$' then
    raise exception 'Số điện thoại không hợp lệ' using errcode = '22023';
  end if;
  if v_gender is not null and v_gender not in ('MALE', 'FEMALE', 'OTHER') then
    raise exception 'Giới tính không hợp lệ' using errcode = '22023';
  end if;
  if v_group not in ('RETAIL', 'MEMBER', 'LOYAL', 'VIP') then
    raise exception 'Nhóm khách không hợp lệ' using errcode = '22023';
  end if;
  if exists (select 1 from public.pos_customers c where c.phone = v_phone) then
    raise exception 'Số điện thoại đã tồn tại' using errcode = '23505';
  end if;

  insert into public.pos_customers (
    customer_no, name, phone, email, address, tax_code, note,
    gender, customer_group, date_of_birth
  ) values (
    'KH' || lpad(nextval('public.pos_customer_seq')::text, 6, '0'),
    v_name,
    v_phone,
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_tax_code, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v_gender,
    v_group,
    p_date_of_birth
  )
  returning id into v_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'CUSTOMER_CREATE', 'customer', v_id, 'Tạo khách hàng',
    jsonb_build_object('phone', v_phone)
  );

  return jsonb_build_object('ok', true, 'customer', pos_private.customer_json(v_id));
end;
$$;

create or replace function pos_private.update_customer(
  p_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_tax_code text,
  p_note text,
  p_gender text,
  p_customer_group text,
  p_date_of_birth date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_row public.pos_customers%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := pos_private.normalize_phone(p_phone);
  v_group text := coalesce(nullif(trim(coalesce(p_customer_group, '')), ''), 'RETAIL');
  v_gender text := nullif(trim(coalesce(p_gender, '')), '');
begin
  v_actor := pos_private.require_admin();
  select * into v_row from public.pos_customers where id = p_id;
  if v_row.id is null then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;
  if v_row.is_walk_in then
    raise exception 'Không sửa khách lẻ hệ thống' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception 'Khách hàng cần họ tên' using errcode = '22023';
  end if;
  if v_phone = '' or v_phone = 'WALKIN' or v_phone !~ '^[0-9]{9,11}$' then
    raise exception 'Số điện thoại không hợp lệ' using errcode = '22023';
  end if;
  if v_gender is not null and v_gender not in ('MALE', 'FEMALE', 'OTHER') then
    raise exception 'Giới tính không hợp lệ' using errcode = '22023';
  end if;
  if v_group not in ('RETAIL', 'MEMBER', 'LOYAL', 'VIP') then
    raise exception 'Nhóm khách không hợp lệ' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.pos_customers c
    where c.phone = v_phone and c.id <> p_id
  ) then
    raise exception 'Số điện thoại đã tồn tại' using errcode = '23505';
  end if;

  update public.pos_customers
  set
    name = v_name,
    phone = v_phone,
    email = nullif(trim(coalesce(p_email, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), ''),
    tax_code = nullif(trim(coalesce(p_tax_code, '')), ''),
    note = nullif(trim(coalesce(p_note, '')), ''),
    gender = v_gender,
    customer_group = v_group,
    date_of_birth = p_date_of_birth,
    updated_at = now()
  where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason)
  values (v_actor, 'CUSTOMER_UPDATE', 'customer', p_id, 'Cập nhật khách hàng');

  return jsonb_build_object('ok', true, 'customer', pos_private.customer_json(p_id));
end;
$$;

create or replace function pos_private.delete_customer(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_row public.pos_customers%rowtype;
begin
  v_actor := pos_private.require_admin();
  select * into v_row from public.pos_customers where id = p_id;
  if v_row.id is null then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;
  if v_row.is_walk_in then
    raise exception 'Không xóa khách lẻ hệ thống' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pos_sales s where s.customer_id = p_id) then
    raise exception 'Không xóa khách đã có giao dịch' using errcode = 'P0001';
  end if;

  delete from public.pos_customers where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'CUSTOMER_DELETE', 'customer', p_id, 'Xóa khách chưa phát sinh giao dịch',
    jsonb_build_object('customer_no', v_row.customer_no, 'phone', v_row.phone)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function pos_private.list_customers(
  p_query text,
  p_group text,
  p_sort text,
  p_limit integer,
  p_offset integer
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
  v_sort text := coalesce(nullif(trim(coalesce(p_sort, '')), ''), 'newest');
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
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

  select count(*) into v_total
  from public.pos_customers c
  where not c.is_walk_in
    and (v_group is null or c.customer_group = v_group)
    and (
      v_q = ''
      or lower(c.name) like '%' || v_q || '%'
      or c.phone like '%' || v_q || '%'
      or lower(c.customer_no) like '%' || v_q || '%'
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

create or replace function pos_private.get_customer(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer jsonb;
  v_history jsonb;
begin
  perform pos_private.require_admin();
  v_customer := pos_private.customer_json(p_id);
  if v_customer is null then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'invoice_id', h.invoice_id,
        'invoice_no', h.invoice_no,
        'sale_no', h.sale_no,
        'issued_at', h.issued_at,
        'total_dong', h.total_dong,
        'status', h.status,
        'payment_method', h.payment_method
      )
      order by h.issued_at desc
    ),
    '[]'::jsonb
  )
  into v_history
  from (
    select
      i.id as invoice_id,
      i.invoice_no,
      s.sale_no,
      i.issued_at,
      i.total_dong,
      s.status,
      s.payment_method
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    where i.customer_id = p_id
      and s.status = 'COMPLETED'
    order by i.issued_at desc
    limit 20
  ) h;

  return jsonb_build_object(
    'ok', true,
    'customer', v_customer,
    'history', v_history
  );
end;
$$;

create or replace function pos_private.get_walk_in_customer()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform pos_private.require_admin();
  select c.id into v_id from public.pos_customers c where c.is_walk_in limit 1;
  if v_id is null then
    raise exception 'Chưa có khách lẻ hệ thống' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true, 'customer', pos_private.customer_json(v_id));
end;
$$;

drop function if exists public.pos_complete_sale(text, text, text, text, jsonb);
drop function if exists pos_private.complete_sale(text, text, text, text, jsonb);

create or replace function pos_private.complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_customer_id uuid;
  v_sale_id uuid;
  v_sale_no text;
  v_invoice_id uuid;
  v_invoice_no text;
  v_item record;
  v_sku public.pos_skus%rowtype;
  v_price record;
  v_total bigint := 0;
  v_sku_ids uuid[];
  v_stock integer;
  v_result jsonb;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  v_actor := pos_private.require_admin();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_sale');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Giỏ hàng trống' using errcode = '22023';
    end if;

    select array_agg(x.sku_id order by x.sku_id)
    into v_sku_ids
    from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer);

    if exists (
      select 1 from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
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
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
    loop
      if v_item.quantity is null or v_item.quantity <= 0 then
        raise exception 'Số lượng bán phải > 0' using errcode = '22023';
      end if;
      select quantity into v_stock
      from public.pos_inventory_stock
      where sku_id = v_item.sku_id;
      if v_stock is null then
        raise exception 'SKU không tồn tại trên sổ kho' using errcode = 'P0001';
      end if;
      if v_stock < v_item.quantity then
        raise exception 'Không đủ tồn kho' using errcode = 'P0001';
      end if;
    end loop;

    if p_customer_id is not null then
      select c.id into v_customer_id
      from public.pos_customers c
      where c.id = p_customer_id;
      if v_customer_id is null then
        raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
      end if;
    else
      v_customer_id := pos_private.upsert_customer(p_customer_name, p_customer_phone);
    end if;

    v_sale_no := 'SALE-' || lpad(nextval('public.pos_sale_seq')::text, 6, '0');
    v_invoice_no := 'HD' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');

    insert into public.pos_sales (
      sale_no, customer_id, status, payment_method, total_dong,
      idempotency_key, actor_email, completed_at, note
    ) values (
      v_sale_no, v_customer_id, 'COMPLETED', p_payment_method, 0,
      trim(p_idempotency_key), v_actor, now(), v_note
    )
    returning id into v_sale_id;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
    loop
      select * into v_sku from public.pos_skus where id = v_item.sku_id and is_active;
      if v_sku.id is null then
        raise exception 'SKU không hoạt động' using errcode = 'P0001';
      end if;

      select * into v_price from pos_private.compute_unit_price(v_sku);

      insert into public.pos_sale_items (
        sale_id, sku_id, quantity, unit_price_dong, total_price_dong,
        gold_sell_dong, weight_chi, board_unit_chi, labor_fee_dong, price_row_id
      ) values (
        v_sale_id, v_sku.id, v_item.quantity, v_price.unit_price_dong,
        v_price.unit_price_dong * v_item.quantity,
        v_price.gold_sell_dong, v_sku.weight_chi, v_sku.board_unit_chi,
        v_sku.labor_fee_dong, v_sku.price_row_id
      );

      v_total := v_total + (v_price.unit_price_dong * v_item.quantity);
    end loop;

    update public.pos_sales
    set total_dong = v_total
    where id = v_sale_id;

    insert into public.pos_invoices (
      invoice_no, sale_id, customer_id, status, total_dong, issued_at, actor_email
    ) values (
      v_invoice_no, v_sale_id, v_customer_id, 'ISSUED', v_total, now(), v_actor
    )
    returning id into v_invoice_id;

    for v_item in
      select * from jsonb_to_recordset(p_items) as x(sku_id uuid, quantity integer)
    loop
      perform pos_private.apply_stock_change(
        v_item.sku_id,
        - v_item.quantity,
        'SALE',
        'Bán hàng',
        'SALE',
        v_sale_id,
        v_actor
      );
    end loop;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'SALE', 'sale', v_sale_id, 'Bán hàng',
      jsonb_build_object(
        'sale_no', v_sale_no,
        'invoice_no', v_invoice_no,
        'invoice_id', v_invoice_id,
        'customer_id', v_customer_id,
        'total_dong', v_total
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
      'status', 'COMPLETED'
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

create or replace function public.pos_create_customer(
  p_name text,
  p_phone text,
  p_email text default null,
  p_address text default null,
  p_tax_code text default null,
  p_note text default null,
  p_gender text default null,
  p_customer_group text default 'RETAIL',
  p_date_of_birth date default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.create_customer(
    p_name, p_phone, p_email, p_address, p_tax_code, p_note,
    p_gender, p_customer_group, p_date_of_birth
  );
$$;

create or replace function public.pos_update_customer(
  p_id uuid,
  p_name text,
  p_phone text,
  p_email text default null,
  p_address text default null,
  p_tax_code text default null,
  p_note text default null,
  p_gender text default null,
  p_customer_group text default 'RETAIL',
  p_date_of_birth date default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.update_customer(
    p_id, p_name, p_phone, p_email, p_address, p_tax_code, p_note,
    p_gender, p_customer_group, p_date_of_birth
  );
$$;

create or replace function public.pos_delete_customer(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.delete_customer(p_id);
$$;

create or replace function public.pos_list_customers(
  p_query text default '',
  p_group text default null,
  p_sort text default 'newest',
  p_limit integer default 8,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pos_private.list_customers(p_query, p_group, p_sort, p_limit, p_offset);
$$;

create or replace function public.pos_get_customer(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pos_private.get_customer(p_id);
$$;

create or replace function public.pos_get_walk_in_customer()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pos_private.get_walk_in_customer();
$$;

create or replace function public.pos_complete_sale(
  p_idempotency_key text,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.complete_sale(
    p_idempotency_key, p_customer_name, p_customer_phone, p_payment_method,
    p_items, p_customer_id, p_note
  );
$$;

revoke all on function public.pos_create_customer(text, text, text, text, text, text, text, text, date) from public, anon;
revoke all on function public.pos_update_customer(uuid, text, text, text, text, text, text, text, text, date) from public, anon;
revoke all on function public.pos_delete_customer(uuid) from public, anon;
revoke all on function public.pos_list_customers(text, text, text, integer, integer) from public, anon;
revoke all on function public.pos_get_customer(uuid) from public, anon;
revoke all on function public.pos_get_walk_in_customer() from public, anon;
revoke all on function public.pos_complete_sale(text, text, text, text, jsonb, uuid, text) from public, anon;

grant execute on function public.pos_create_customer(text, text, text, text, text, text, text, text, date) to authenticated;
grant execute on function public.pos_update_customer(uuid, text, text, text, text, text, text, text, text, date) to authenticated;
grant execute on function public.pos_delete_customer(uuid) to authenticated;
grant execute on function public.pos_list_customers(text, text, text, integer, integer) to authenticated;
grant execute on function public.pos_get_customer(uuid) to authenticated;
grant execute on function public.pos_get_walk_in_customer() to authenticated;
grant execute on function public.pos_complete_sale(text, text, text, text, jsonb, uuid, text) to authenticated;
