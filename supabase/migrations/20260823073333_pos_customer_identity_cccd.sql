-- Spec §21–24: customer type INDIVIDUAL/BUSINESS, CCCD fields, CCCD images (private storage).
-- Spec §26: STAFF may use Customer APIs → require_pos_user (not admin-only).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.pos_customers
  add column if not exists customer_type text not null default 'INDIVIDUAL',
  add column if not exists nationality text,
  add column if not exists citizen_id text,
  add column if not exists citizen_id_issue_date date,
  add column if not exists citizen_id_issue_place text,
  add column if not exists business_name text,
  add column if not exists representative_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pos_customers_type_check'
  ) then
    alter table public.pos_customers
      add constraint pos_customers_type_check
      check (customer_type in ('INDIVIDUAL', 'BUSINESS'));
  end if;
end $$;

create index if not exists pos_customers_citizen_id_idx
  on public.pos_customers (citizen_id)
  where citizen_id is not null;

create index if not exists pos_customers_tax_code_idx
  on public.pos_customers (tax_code)
  where tax_code is not null;

create index if not exists pos_customers_type_idx
  on public.pos_customers (customer_type);

create table if not exists public.pos_customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.pos_customers(id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  mime_type text,
  byte_size integer,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  constraint pos_customer_documents_type_check
    check (document_type in ('CCCD_FRONT', 'CCCD_BACK')),
  constraint pos_customer_documents_path_check
    check (length(trim(storage_path)) > 0)
);

create unique index if not exists pos_customer_documents_one_per_type_idx
  on public.pos_customer_documents (customer_id, document_type);

create index if not exists pos_customer_documents_customer_idx
  on public.pos_customer_documents (customer_id);

alter table public.pos_customer_documents enable row level security;

drop policy if exists pos_customer_documents_pos_select on public.pos_customer_documents;
create policy pos_customer_documents_pos_select
  on public.pos_customer_documents for select to authenticated
  using (public.tlkv_has_pos_access());

revoke all on public.pos_customer_documents from anon, authenticated;
grant select on public.pos_customer_documents to authenticated;

-- Private bucket for CCCD images (no public URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-cccd',
  'customer-cccd',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists customer_cccd_select on storage.objects;
drop policy if exists customer_cccd_insert on storage.objects;
drop policy if exists customer_cccd_update on storage.objects;
drop policy if exists customer_cccd_delete on storage.objects;

create policy customer_cccd_select
  on storage.objects for select to authenticated
  using (bucket_id = 'customer-cccd' and public.tlkv_has_pos_access());

create policy customer_cccd_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-cccd' and public.tlkv_has_pos_access());

create policy customer_cccd_update
  on storage.objects for update to authenticated
  using (bucket_id = 'customer-cccd' and public.tlkv_has_pos_access())
  with check (bucket_id = 'customer-cccd' and public.tlkv_has_pos_access());

create policy customer_cccd_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'customer-cccd' and public.tlkv_has_pos_access());

-- ---------------------------------------------------------------------------
-- customer_json + CRUD (identity fields)
-- ---------------------------------------------------------------------------

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
  v_docs jsonb;
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'document_type', d.document_type,
        'storage_path', d.storage_path,
        'mime_type', d.mime_type,
        'byte_size', d.byte_size,
        'uploaded_by', d.uploaded_by,
        'uploaded_at', d.uploaded_at
      )
      order by d.document_type
    ),
    '[]'::jsonb
  )
  into v_docs
  from public.pos_customer_documents d
  where d.customer_id = p_id;

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
    'customer_type', v_row.customer_type,
    'nationality', v_row.nationality,
    'citizen_id', v_row.citizen_id,
    'citizen_id_issue_date', v_row.citizen_id_issue_date,
    'citizen_id_issue_place', v_row.citizen_id_issue_place,
    'business_name', v_row.business_name,
    'representative_name', v_row.representative_name,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'total_dong', v_total,
    'sale_count', v_count,
    'debt_dong', 0,
    'last_activity_at', coalesce(v_last, v_row.updated_at),
    'documents', v_docs
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
  p_date_of_birth date,
  p_customer_type text default 'INDIVIDUAL',
  p_nationality text default null,
  p_citizen_id text default null,
  p_citizen_id_issue_date date default null,
  p_citizen_id_issue_place text default null,
  p_business_name text default null,
  p_representative_name text default null
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
  v_type text := coalesce(nullif(trim(coalesce(p_customer_type, '')), ''), 'INDIVIDUAL');
  v_citizen text := nullif(trim(coalesce(p_citizen_id, '')), '');
  v_business text := nullif(trim(coalesce(p_business_name, '')), '');
  v_rep text := nullif(trim(coalesce(p_representative_name, '')), '');
  v_tax text := nullif(trim(coalesce(p_tax_code, '')), '');
begin
  v_actor := pos_private.require_pos_user();

  if v_type not in ('INDIVIDUAL', 'BUSINESS') then
    raise exception 'Loại khách hàng không hợp lệ' using errcode = '22023';
  end if;

  if v_type = 'BUSINESS' then
    if v_business is null then
      raise exception 'Doanh nghiệp cần tên doanh nghiệp' using errcode = '22023';
    end if;
    if v_name = '' then
      v_name := v_business;
    end if;
  elsif v_name = '' then
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
  if v_citizen is not null and exists (
    select 1 from public.pos_customers c where c.citizen_id = v_citizen
  ) then
    raise exception 'Số CCCD đã tồn tại' using errcode = '23505';
  end if;

  insert into public.pos_customers (
    customer_no, name, phone, email, address, tax_code, note,
    gender, customer_group, date_of_birth,
    customer_type, nationality, citizen_id, citizen_id_issue_date,
    citizen_id_issue_place, business_name, representative_name
  ) values (
    'KH' || lpad(nextval('public.pos_customer_seq')::text, 6, '0'),
    v_name,
    v_phone,
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    v_tax,
    nullif(trim(coalesce(p_note, '')), ''),
    v_gender,
    v_group,
    p_date_of_birth,
    v_type,
    nullif(trim(coalesce(p_nationality, '')), ''),
    v_citizen,
    p_citizen_id_issue_date,
    nullif(trim(coalesce(p_citizen_id_issue_place, '')), ''),
    v_business,
    v_rep
  )
  returning id into v_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'CUSTOMER_CREATE', 'customer', v_id, 'Tạo khách hàng',
    jsonb_build_object(
      'phone', v_phone,
      'customer_type', v_type,
      'citizen_id_set', v_citizen is not null
    )
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
  p_date_of_birth date,
  p_customer_type text default 'INDIVIDUAL',
  p_nationality text default null,
  p_citizen_id text default null,
  p_citizen_id_issue_date date default null,
  p_citizen_id_issue_place text default null,
  p_business_name text default null,
  p_representative_name text default null
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
  v_type text := coalesce(nullif(trim(coalesce(p_customer_type, '')), ''), 'INDIVIDUAL');
  v_citizen text := nullif(trim(coalesce(p_citizen_id, '')), '');
  v_business text := nullif(trim(coalesce(p_business_name, '')), '');
  v_rep text := nullif(trim(coalesce(p_representative_name, '')), '');
  v_tax text := nullif(trim(coalesce(p_tax_code, '')), '');
begin
  v_actor := pos_private.require_pos_user();
  select * into v_row from public.pos_customers where id = p_id;
  if v_row.id is null then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;
  if v_row.is_walk_in then
    raise exception 'Không sửa khách lẻ hệ thống' using errcode = 'P0001';
  end if;

  if v_type not in ('INDIVIDUAL', 'BUSINESS') then
    raise exception 'Loại khách hàng không hợp lệ' using errcode = '22023';
  end if;

  if v_type = 'BUSINESS' then
    if v_business is null then
      raise exception 'Doanh nghiệp cần tên doanh nghiệp' using errcode = '22023';
    end if;
    if v_name = '' then
      v_name := v_business;
    end if;
  elsif v_name = '' then
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
  if v_citizen is not null and exists (
    select 1 from public.pos_customers c
    where c.citizen_id = v_citizen and c.id <> p_id
  ) then
    raise exception 'Số CCCD đã tồn tại' using errcode = '23505';
  end if;

  update public.pos_customers
  set
    name = v_name,
    phone = v_phone,
    email = nullif(trim(coalesce(p_email, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), ''),
    tax_code = v_tax,
    note = nullif(trim(coalesce(p_note, '')), ''),
    gender = v_gender,
    customer_group = v_group,
    date_of_birth = p_date_of_birth,
    customer_type = v_type,
    nationality = nullif(trim(coalesce(p_nationality, '')), ''),
    citizen_id = v_citizen,
    citizen_id_issue_date = p_citizen_id_issue_date,
    citizen_id_issue_place = nullif(trim(coalesce(p_citizen_id_issue_place, '')), ''),
    business_name = v_business,
    representative_name = v_rep,
    updated_at = now()
  where id = p_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'CUSTOMER_UPDATE', 'customer', p_id, 'Cập nhật khách hàng',
    jsonb_build_object('customer_type', v_type, 'citizen_id_set', v_citizen is not null)
  );

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
  v_sales integer := 0;
begin
  v_actor := pos_private.require_pos_user();
  select * into v_row from public.pos_customers where id = p_id;
  if v_row.id is null then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;
  if v_row.is_walk_in then
    raise exception 'Không xóa khách lẻ hệ thống' using errcode = 'P0001';
  end if;

  select count(*) into v_sales
  from public.pos_sales s
  where s.customer_id = p_id;

  if v_sales > 0 then
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
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 5000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer := 0;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();

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
      or lower(coalesce(c.citizen_id, '')) like '%' || v_q || '%'
      or lower(coalesce(c.tax_code, '')) like '%' || v_q || '%'
      or lower(coalesce(c.business_name, '')) like '%' || v_q || '%'
    )
    and (
      v_activity is null
      or (
        v_activity = 'purchased'
        and exists (
          select 1 from public.pos_sales s
          where s.customer_id = c.id and s.status = 'COMPLETED'
        )
      )
      or (
        v_activity = 'never'
        and not exists (
          select 1 from public.pos_sales s
          where s.customer_id = c.id and s.status = 'COMPLETED'
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
        or lower(coalesce(c.citizen_id, '')) like '%' || v_q || '%'
        or lower(coalesce(c.tax_code, '')) like '%' || v_q || '%'
        or lower(coalesce(c.business_name, '')) like '%' || v_q || '%'
      )
      and (
        v_activity is null
        or (
          v_activity = 'purchased'
          and exists (
            select 1 from public.pos_sales s
            where s.customer_id = c.id and s.status = 'COMPLETED'
          )
        )
        or (
          v_activity = 'never'
          and not exists (
            select 1 from public.pos_sales s
            where s.customer_id = c.id and s.status = 'COMPLETED'
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
  perform pos_private.require_pos_user();
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
  perform pos_private.require_pos_user();
  select c.id into v_id from public.pos_customers c where c.is_walk_in limit 1;
  if v_id is null then
    raise exception 'Chưa có khách lẻ hệ thống' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true, 'customer', pos_private.customer_json(v_id));
end;
$$;

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
  perform pos_private.require_pos_user();

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

-- ---------------------------------------------------------------------------
-- Document metadata RPCs
-- ---------------------------------------------------------------------------

create or replace function pos_private.upsert_customer_document(
  p_customer_id uuid,
  p_document_type text,
  p_storage_path text,
  p_mime_type text default null,
  p_byte_size integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_id uuid;
  v_type text := upper(trim(coalesce(p_document_type, '')));
  v_path text := trim(coalesce(p_storage_path, ''));
begin
  v_actor := pos_private.require_pos_user();

  if not exists (select 1 from public.pos_customers c where c.id = p_customer_id and not c.is_walk_in) then
    raise exception 'Không tìm thấy khách hàng' using errcode = 'P0002';
  end if;
  if v_type not in ('CCCD_FRONT', 'CCCD_BACK') then
    raise exception 'Loại tài liệu không hợp lệ' using errcode = '22023';
  end if;
  if v_path = '' or position('..' in v_path) > 0 then
    raise exception 'Đường dẫn lưu trữ không hợp lệ' using errcode = '22023';
  end if;
  if not v_path like (p_customer_id::text || '/%') then
    raise exception 'Đường dẫn phải thuộc khách hàng' using errcode = '22023';
  end if;

  insert into public.pos_customer_documents (
    customer_id, document_type, storage_path, mime_type, byte_size, uploaded_by
  ) values (
    p_customer_id, v_type, v_path, nullif(trim(coalesce(p_mime_type, '')), ''),
    p_byte_size, v_actor
  )
  on conflict (customer_id, document_type) do update
  set
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    byte_size = excluded.byte_size,
    uploaded_by = excluded.uploaded_by,
    uploaded_at = now()
  returning id into v_id;

  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'UPLOAD_CCCD', 'customer', p_customer_id, 'Upload ảnh CCCD',
    jsonb_build_object('document_type', v_type, 'document_id', v_id)
  );

  return jsonb_build_object(
    'ok', true,
    'document', jsonb_build_object(
      'id', v_id,
      'document_type', v_type,
      'storage_path', v_path,
      'uploaded_by', v_actor,
      'uploaded_at', now()
    )
  );
end;
$$;

create or replace function public.pos_upsert_customer_document(
  p_customer_id uuid,
  p_document_type text,
  p_storage_path text,
  p_mime_type text default null,
  p_byte_size integer default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.upsert_customer_document(
    p_customer_id, p_document_type, p_storage_path, p_mime_type, p_byte_size
  );
$$;

create or replace function public.pos_audit_view_cccd(p_customer_id uuid, p_document_type text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  v_actor := pos_private.require_pos_user();
  insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
  values (
    v_actor, 'VIEW_CCCD', 'customer', p_customer_id, 'Xem ảnh CCCD (signed URL)',
    jsonb_build_object('document_type', upper(trim(coalesce(p_document_type, ''))))
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers (drop old create/update signatures)
-- ---------------------------------------------------------------------------

drop function if exists public.pos_create_customer(text, text, text, text, text, text, text, text, date);
drop function if exists public.pos_update_customer(uuid, text, text, text, text, text, text, text, text, date);

create or replace function public.pos_create_customer(
  p_name text,
  p_phone text,
  p_email text default null,
  p_address text default null,
  p_tax_code text default null,
  p_note text default null,
  p_gender text default null,
  p_customer_group text default 'RETAIL',
  p_date_of_birth date default null,
  p_customer_type text default 'INDIVIDUAL',
  p_nationality text default null,
  p_citizen_id text default null,
  p_citizen_id_issue_date date default null,
  p_citizen_id_issue_place text default null,
  p_business_name text default null,
  p_representative_name text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.create_customer(
    p_name, p_phone, p_email, p_address, p_tax_code, p_note,
    p_gender, p_customer_group, p_date_of_birth,
    p_customer_type, p_nationality, p_citizen_id, p_citizen_id_issue_date,
    p_citizen_id_issue_place, p_business_name, p_representative_name
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
  p_date_of_birth date default null,
  p_customer_type text default 'INDIVIDUAL',
  p_nationality text default null,
  p_citizen_id text default null,
  p_citizen_id_issue_date date default null,
  p_citizen_id_issue_place text default null,
  p_business_name text default null,
  p_representative_name text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.update_customer(
    p_id, p_name, p_phone, p_email, p_address, p_tax_code, p_note,
    p_gender, p_customer_group, p_date_of_birth,
    p_customer_type, p_nationality, p_citizen_id, p_citizen_id_issue_date,
    p_citizen_id_issue_place, p_business_name, p_representative_name
  );
$$;

revoke all on function public.pos_create_customer(
  text, text, text, text, text, text, text, text, date,
  text, text, text, date, text, text, text
) from public, anon;
revoke all on function public.pos_update_customer(
  uuid, text, text, text, text, text, text, text, text, date,
  text, text, text, date, text, text, text
) from public, anon;
revoke all on function public.pos_upsert_customer_document(uuid, text, text, text, integer) from public, anon;
revoke all on function public.pos_audit_view_cccd(uuid, text) from public, anon;

grant execute on function public.pos_create_customer(
  text, text, text, text, text, text, text, text, date,
  text, text, text, date, text, text, text
) to authenticated;
grant execute on function public.pos_update_customer(
  uuid, text, text, text, text, text, text, text, text, date,
  text, text, text, date, text, text, text
) to authenticated;
grant execute on function public.pos_upsert_customer_document(uuid, text, text, text, integer) to authenticated;
grant execute on function public.pos_audit_view_cccd(uuid, text) to authenticated;
