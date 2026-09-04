-- CCCD: normalize digits, unique constraint, clearer duplicate message.
-- Customer detail history: union completed sales + buys.

create or replace function pos_private.normalize_citizen_id(p_raw text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(trim(coalesce(p_raw, '')), '[^0-9]', '', 'g'), '');
$$;

-- Backfill normalized digits-only values (idempotent).
update public.pos_customers
set citizen_id = pos_private.normalize_citizen_id(citizen_id)
where citizen_id is not null
  and citizen_id is distinct from pos_private.normalize_citizen_id(citizen_id);

drop index if exists public.pos_customers_citizen_id_uidx;
create unique index pos_customers_citizen_id_uidx
  on public.pos_customers (citizen_id)
  where citizen_id is not null;

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
        'activity_id', h.activity_id,
        'activity_kind', h.activity_kind,
        'doc_no', h.doc_no,
        'invoice_id', h.invoice_id,
        'invoice_no', h.doc_no,
        'sale_no', h.sale_no,
        'issued_at', h.issued_at,
        'total_dong', h.total_dong,
        'paid_dong', h.paid_dong,
        'remaining_dong', h.remaining_dong,
        'payment_status', h.payment_status,
        'status', h.status,
        'payment_method', h.payment_method,
        'transaction_type', h.transaction_type,
        'fulfillment_status', h.fulfillment_status
      )
      order by h.issued_at desc
    ),
    '[]'::jsonb
  )
  into v_history
  from (
    select *
    from (
      select
        i.id::text as activity_id,
        'SALE'::text as activity_kind,
        i.invoice_no as doc_no,
        i.id as invoice_id,
        s.sale_no,
        i.issued_at,
        i.total_dong,
        s.paid_dong,
        s.remaining_dong,
        s.payment_status,
        s.status,
        s.payment_method,
        coalesce(s.transaction_type, 'SALE') as transaction_type,
        coalesce(s.fulfillment_status, 'DELIVERED') as fulfillment_status
      from public.pos_invoices i
      join public.pos_sales s on s.id = i.sale_id
      where i.customer_id = p_id
        and s.status = 'COMPLETED'

      union all

      select
        b.id::text as activity_id,
        'BUY'::text as activity_kind,
        b.buy_no as doc_no,
        null::uuid as invoice_id,
        b.buy_no as sale_no,
        coalesce(b.completed_at, b.created_at) as issued_at,
        b.total_dong,
        b.paid_dong,
        b.remaining_dong,
        b.payment_status,
        b.status,
        b.payment_method,
        'BUY'::text as transaction_type,
        'RECEIVED'::text as fulfillment_status
      from public.pos_buys b
      where b.customer_id = p_id
        and b.status = 'COMPLETED'
    ) u
    order by u.issued_at desc
    limit 40
  ) h;

  return jsonb_build_object(
    'ok', true,
    'customer', v_customer,
    'history', v_history
  );
end;
$$;
