-- Customer CCCD expiry date (ngày hết hạn CCCD).

alter table public.pos_customers
  add column if not exists citizen_id_expiry_date date;

comment on column public.pos_customers.citizen_id_expiry_date is
  'Ngày hết hạn CCCD (optional). Display/edit with other CCCD identity fields.';

-- Extend customer_json with expiry (same signature).
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
    'citizen_id_expiry_date', v_row.citizen_id_expiry_date,
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

drop function if exists public.pos_create_customer(
  text, text, text, text, text, text, text, text, date, text, text, text, date, text, text, text
);
drop function if exists public.pos_update_customer(
  uuid, text, text, text, text, text, text, text, text, date, text, text, text, date, text, text, text
);
drop function if exists pos_private.create_customer(
  text, text, text, text, text, text, text, text, date, text, text, text, date, text, text, text
);
drop function if exists pos_private.update_customer(
  uuid, text, text, text, text, text, text, text, text, date, text, text, text, date, text, text, text
);

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
  p_representative_name text default null,
  p_citizen_id_expiry_date date default null
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
  v_citizen text := pos_private.normalize_citizen_id(p_citizen_id);
  v_business text := nullif(trim(coalesce(p_business_name, '')), '');
  v_rep text := nullif(trim(coalesce(p_representative_name, '')), '');
  v_tax text := nullif(trim(coalesce(p_tax_code, '')), '');
  v_dup_no text;
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

  if v_citizen is not null then
    if length(v_citizen) < 9 or length(v_citizen) > 12 then
      raise exception 'Số CCCD không hợp lệ' using errcode = '22023';
    end if;
    select c.customer_no into v_dup_no
    from public.pos_customers c
    where c.citizen_id = v_citizen
    limit 1;
    if v_dup_no is not null then
      raise exception '%', format(
        'Số CCCD này đã được gắn với khách hàng %s. Vui lòng chọn khách hàng đó hoặc nhập số CCCD khác.',
        v_dup_no
      ) using errcode = '23505';
    end if;
  end if;

  if p_citizen_id_expiry_date is not null
     and p_citizen_id_issue_date is not null
     and p_citizen_id_expiry_date < p_citizen_id_issue_date then
    raise exception 'Ngày hết hạn CCCD phải sau hoặc bằng ngày cấp' using errcode = '22023';
  end if;

  insert into public.pos_customers (
    customer_no, name, phone, email, address, tax_code, note,
    gender, customer_group, date_of_birth,
    customer_type, nationality, citizen_id, citizen_id_issue_date,
    citizen_id_issue_place, citizen_id_expiry_date, business_name, representative_name
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
    p_citizen_id_expiry_date,
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
  p_representative_name text default null,
  p_citizen_id_expiry_date date default null
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
  v_citizen text := pos_private.normalize_citizen_id(p_citizen_id);
  v_business text := nullif(trim(coalesce(p_business_name, '')), '');
  v_rep text := nullif(trim(coalesce(p_representative_name, '')), '');
  v_tax text := nullif(trim(coalesce(p_tax_code, '')), '');
  v_dup_no text;
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

  if v_citizen is not null then
    if length(v_citizen) < 9 or length(v_citizen) > 12 then
      raise exception 'Số CCCD không hợp lệ' using errcode = '22023';
    end if;
    select c.customer_no into v_dup_no
    from public.pos_customers c
    where c.citizen_id = v_citizen and c.id <> p_id
    limit 1;
    if v_dup_no is not null then
      raise exception '%', format(
        'Số CCCD này đã được gắn với khách hàng %s. Vui lòng chọn khách hàng đó hoặc nhập số CCCD khác.',
        v_dup_no
      ) using errcode = '23505';
    end if;
  end if;

  if p_citizen_id_expiry_date is not null
     and p_citizen_id_issue_date is not null
     and p_citizen_id_expiry_date < p_citizen_id_issue_date then
    raise exception 'Ngày hết hạn CCCD phải sau hoặc bằng ngày cấp' using errcode = '22023';
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
    citizen_id_expiry_date = p_citizen_id_expiry_date,
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
  p_representative_name text default null,
  p_citizen_id_expiry_date date default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.create_customer(
    p_name, p_phone, p_email, p_address, p_tax_code, p_note,
    p_gender, p_customer_group, p_date_of_birth, p_customer_type, p_nationality, p_citizen_id,
    p_citizen_id_issue_date, p_citizen_id_issue_place, p_business_name, p_representative_name,
    p_citizen_id_expiry_date
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
  p_representative_name text default null,
  p_citizen_id_expiry_date date default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select pos_private.update_customer(
    p_id, p_name, p_phone, p_email, p_address, p_tax_code, p_note,
    p_gender, p_customer_group, p_date_of_birth, p_customer_type, p_nationality, p_citizen_id,
    p_citizen_id_issue_date, p_citizen_id_issue_place, p_business_name, p_representative_name,
    p_citizen_id_expiry_date
  );
$$;

revoke all on function public.pos_create_customer(
  text, text, text, text, text, text, text, text, date, text, text, text, date, text, text, text, date
) from public, anon;
revoke all on function public.pos_update_customer(
  uuid, text, text, text, text, text, text, text, text, date, text, text, text, date, text, text, text, date
) from public, anon;

grant execute on function public.pos_create_customer(
  text, text, text, text, text, text, text, text, date, text, text, text, date, text, text, text, date
) to authenticated;
grant execute on function public.pos_update_customer(
  uuid, text, text, text, text, text, text, text, text, date, text, text, text, date, text, text, text, date
) to authenticated;
