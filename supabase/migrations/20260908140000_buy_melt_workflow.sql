-- Replace one-shot buy complete with melt workflow:
-- INTAKE → MELT_COMMITTED → MELTING → WEIGHT_ENTERED → AWAITING_CONFIRM
-- → agree: FORM02 + stock/cash COMPLETED | disagree: CANCELLED (no stock/cash)

create sequence if not exists public.pos_buy_doc_seq;

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------
alter table public.pos_buys drop constraint if exists pos_buys_status_check;
alter table public.pos_buys
  add constraint pos_buys_status_check
  check (status in ('PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED', 'VOIDED'));

alter table public.pos_buys
  add column if not exists workflow_status text,
  add column if not exists melt_commitment_no text,
  add column if not exists form02_no text,
  add column if not exists melting_started_at timestamptz,
  add column if not exists intended_paid_dong bigint,
  add column if not exists attachment_pdf_path text;

update public.pos_buys
set workflow_status = case
  when status = 'COMPLETED' then 'COMPLETED'
  when status = 'VOIDED' then 'CANCELLED'
  when status = 'FAILED' then 'CANCELLED'
  else coalesce(workflow_status, 'COMPLETED')
end
where workflow_status is null;

alter table public.pos_buys
  alter column workflow_status set default 'INTAKE';

alter table public.pos_buys drop constraint if exists pos_buys_workflow_status_chk;
alter table public.pos_buys
  add constraint pos_buys_workflow_status_chk
  check (workflow_status in (
    'INTAKE',
    'MELT_COMMITTED',
    'MELTING',
    'WEIGHT_ENTERED',
    'AWAITING_CONFIRM',
    'COMPLETED',
    'CANCELLED'
  ));

alter table public.pos_buys
  alter column workflow_status set not null;

alter table public.pos_buy_items
  add column if not exists weight_before_chi numeric(12, 4),
  add column if not exists weight_after_chi numeric(12, 4);

update public.pos_buy_items
set weight_before_chi = coalesce(weight_before_chi, weight_chi)
where weight_before_chi is null;

create table if not exists public.pos_buy_attachments (
  id uuid primary key default gen_random_uuid(),
  buy_id uuid not null references public.pos_buys(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  byte_size bigint,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint pos_buy_attachments_mime_chk check (mime_type = 'application/pdf')
);

create index if not exists pos_buy_attachments_buy_idx
  on public.pos_buy_attachments (buy_id, created_at desc);

alter table public.pos_buy_attachments enable row level security;
drop policy if exists pos_buy_attachments_admin_select on public.pos_buy_attachments;
create policy pos_buy_attachments_admin_select on public.pos_buy_attachments
  for select to authenticated
  using (public.tlkv_has_pos_access());

revoke all on table public.pos_buy_attachments from anon;
grant select on table public.pos_buy_attachments to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Create buy intake (no stock / no cash posting)
-- ---------------------------------------------------------------------------
create or replace function pos_private.create_buy_intake(
  p_idempotency_key text,
  p_customer_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_approve_price_exception boolean default false,
  p_price_exception_reason text default null,
  p_bank_account text default null,
  p_bank_account_holder text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_is_admin boolean;
  v_cached jsonb;
  v_customer public.pos_customers%rowtype;
  v_buy_id uuid;
  v_buy_no text;
  v_item record;
  v_sku_id uuid;
  v_total bigint := 0;
  v_line_total bigint;
  v_per_chi bigint;
  v_ref bigint;
  v_diff bigint;
  v_exception boolean;
  v_is_market boolean;
  v_intended bigint;
  v_due date := p_due_date;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result jsonb;
  v_name text;
  v_brand_id uuid;
  v_brand_name text;
  v_bank text;
  v_holder text;
begin
  v_actor := pos_private.require_pos_user();
  v_is_admin := public.tlkv_is_admin();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'create_buy_intake');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if p_payment_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;
    if p_customer_id is null then
      raise exception 'Phải chọn khách hàng khi mua vào' using errcode = '22023';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Danh sách hàng mua trống' using errcode = '22023';
    end if;

    select * into v_customer from public.pos_customers where id = p_customer_id for share;
    if not found then
      raise exception 'Khách hàng không tồn tại' using errcode = 'P0001';
    end if;
    if v_customer.is_walk_in then
      raise exception 'Không dùng khách lẻ cho giao dịch mua vào' using errcode = '22023';
    end if;

    v_bank := nullif(trim(coalesce(p_bank_account, v_customer.bank_account, '')), '');
    v_holder := nullif(trim(coalesce(p_bank_account_holder, v_customer.bank_account_holder, '')), '');

    for v_item in
      select *
      from jsonb_to_recordset(p_items) as x(
        sku_id uuid,
        is_market_gold boolean,
        product_name text,
        gold_type text,
        gold_age text,
        quantity integer,
        weight_chi numeric,
        unit_price_dong bigint,
        reference_price_dong_per_chi bigint,
        price_row_id text
      )
    loop
      if v_item.quantity is null or v_item.quantity <= 0 then
        raise exception 'Số lượng mua phải > 0' using errcode = '22023';
      end if;
      if v_item.weight_chi is null or v_item.weight_chi <= 0 then
        raise exception 'Trọng lượng phải > 0' using errcode = '22023';
      end if;
      if v_item.unit_price_dong is null or v_item.unit_price_dong < 0 then
        raise exception 'Giá mua không hợp lệ' using errcode = '22023';
      end if;

      v_is_market := coalesce(v_item.is_market_gold, false);
      v_per_chi := v_item.unit_price_dong;

      if not v_is_market then
        if v_item.sku_id is null then
          raise exception 'SKU bắt buộc với hàng catalog' using errcode = '22023';
        end if;
        v_ref := v_item.reference_price_dong_per_chi;
        if v_ref is null then
          raise exception 'Thiếu giá tham chiếu cho sản phẩm catalog' using errcode = '22023';
        end if;
        perform pos_private.assert_price_within_or_exception(
          v_per_chi, v_ref, p_approve_price_exception, v_is_admin, p_price_exception_reason
        );
      end if;

      v_line_total := (v_per_chi::numeric * v_item.weight_chi * v_item.quantity)::bigint;
      v_total := v_total + v_line_total;
    end loop;

    if p_paid_dong is null then
      v_intended := v_total;
    else
      v_intended := p_paid_dong;
    end if;
    if v_intended < 0 or v_intended > v_total then
      raise exception 'Số tiền dự kiến trả không hợp lệ' using errcode = '22023';
    end if;
    if v_intended < v_total and v_due is null then
      raise exception 'Phải có ngày hẹn trả khi chưa trả đủ' using errcode = '22023';
    end if;
    if v_intended = v_total then
      v_due := null;
    end if;

    v_buy_no := 'BUY-' || lpad(nextval('public.pos_buy_seq')::text, 6, '0');

    insert into public.pos_buys (
      buy_no, customer_id, status, workflow_status, payment_method,
      total_dong, paid_dong, remaining_dong, payment_status, due_date,
      intended_paid_dong, note, idempotency_key, actor_email, completed_at, created_at,
      customer_name_snapshot, customer_phone_snapshot, customer_citizen_id_snapshot,
      customer_address_snapshot, customer_bank_account_snapshot, customer_bank_holder_snapshot
    ) values (
      v_buy_no, p_customer_id, 'PROCESSING', 'INTAKE', p_payment_method,
      v_total, 0, v_total, 'UNPAID', v_due,
      v_intended, v_note, trim(p_idempotency_key), v_actor, null, now(),
      v_customer.name, v_customer.phone, v_customer.citizen_id,
      v_customer.address, v_bank, v_holder
    )
    returning id into v_buy_id;

    for v_item in
      select *
      from jsonb_to_recordset(p_items) as x(
        sku_id uuid,
        is_market_gold boolean,
        product_name text,
        gold_type text,
        gold_age text,
        quantity integer,
        weight_chi numeric,
        unit_price_dong bigint,
        reference_price_dong_per_chi bigint,
        price_row_id text
      )
    loop
      v_is_market := coalesce(v_item.is_market_gold, false);
      v_per_chi := v_item.unit_price_dong;
      v_line_total := (v_per_chi::numeric * v_item.weight_chi * v_item.quantity)::bigint;
      v_name := nullif(trim(coalesce(v_item.product_name, '')), '');

      if v_is_market then
        v_ref := null;
        v_diff := null;
        v_exception := false;
        v_sku_id := pos_private.ensure_market_gold_sku(
          v_name, v_item.gold_type, v_item.gold_age, v_item.weight_chi, v_item.price_row_id
        );
        if v_name is null then
          select name into v_name from public.pos_skus where id = v_sku_id;
        end if;
      else
        v_sku_id := v_item.sku_id;
        v_ref := v_item.reference_price_dong_per_chi;
        v_diff := v_per_chi - v_ref;
        v_exception := abs(v_diff) > 300000;
        select name into v_name from public.pos_skus where id = v_sku_id and is_active;
        if v_name is null then
          raise exception 'SKU không tồn tại hoặc đã ngừng' using errcode = 'P0001';
        end if;
        insert into public.pos_inventory_stock (sku_id, quantity, updated_at)
        values (v_sku_id, 0, now())
        on conflict (sku_id) do nothing;
      end if;

      select s.brand_id, b.name into v_brand_id, v_brand_name
      from public.pos_skus s
      left join public.brands b on b.id = s.brand_id
      where s.id = v_sku_id;

      if v_brand_name is null and v_is_market then
        v_brand_name := 'Vàng thị trường';
      end if;

      insert into public.pos_buy_items (
        buy_id, sku_id, product_name_snapshot, gold_type, gold_age,
        quantity, weight_chi, weight_before_chi, weight_after_chi,
        unit_price_dong, total_price_dong,
        reference_price_dong_per_chi, price_row_id, is_market_gold,
        price_exception, difference_per_chi, brand_id, brand_name
      ) values (
        v_buy_id, v_sku_id, v_name, nullif(trim(coalesce(v_item.gold_type, '')), ''),
        nullif(trim(coalesce(v_item.gold_age, '')), ''),
        v_item.quantity, v_item.weight_chi, v_item.weight_chi, null,
        v_per_chi, v_line_total,
        v_ref, nullif(trim(coalesce(v_item.price_row_id, '')), ''),
        v_is_market, v_exception, v_diff, v_brand_id, v_brand_name
      );

      if v_exception then
        insert into public.pos_price_exceptions (
          transaction_type, transaction_id, reference_price_dong_per_chi,
          actual_price_dong_per_chi, difference_per_chi, weight_chi,
          reason, created_by, approved_by, approved_at
        ) values (
          'BUY', v_buy_id, v_ref, v_per_chi, v_diff, v_item.weight_chi,
          nullif(trim(coalesce(p_price_exception_reason, '')), ''),
          v_actor, v_actor, now()
        );
      end if;
    end loop;

    insert into public.pos_audit_log (actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_INTAKE', 'buy', v_buy_id,
      'Tiếp nhận mua vàng ' || v_buy_no,
      jsonb_build_object(
        'buy_no', v_buy_no,
        'total_dong', v_total,
        'intended_paid_dong', v_intended,
        'workflow_status', 'INTAKE'
      )
    );

    v_result := jsonb_build_object(
      'buyId', v_buy_id,
      'buyNo', v_buy_no,
      'totalDong', v_total,
      'paidDong', 0,
      'remainingDong', v_total,
      'paymentStatus', 'UNPAID',
      'dueDate', v_due,
      'customerId', p_customer_id,
      'status', 'PROCESSING',
      'workflowStatus', 'INTAKE'
    );
    return pos_private.finish_idempotency(p_idempotency_key, v_result);
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

create or replace function public.pos_create_buy_intake(
  p_idempotency_key text,
  p_customer_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_note text default null,
  p_paid_dong bigint default null,
  p_due_date date default null,
  p_approve_price_exception boolean default false,
  p_price_exception_reason text default null,
  p_bank_account text default null,
  p_bank_account_holder text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return pos_private.create_buy_intake(
    p_idempotency_key, p_customer_id, p_payment_method, p_items,
    p_note, p_paid_dong, p_due_date, p_approve_price_exception,
    p_price_exception_reason, p_bank_account, p_bank_account_holder
  );
end;
$$;

revoke all on function public.pos_create_buy_intake(text, uuid, text, jsonb, text, bigint, date, boolean, text, text, text)
  from public, anon;
grant execute on function public.pos_create_buy_intake(text, uuid, text, jsonb, text, bigint, date, boolean, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Issue melt commitment / start melting / set weights
-- ---------------------------------------------------------------------------
create or replace function public.pos_issue_melt_commitment(
  p_buy_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_buy public.pos_buys%rowtype;
  v_no text;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'issue_melt_commitment');
  if v_cached is not null then return v_cached; end if;

  begin
    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Chỉ tạo cam kết nấu trên giao dịch đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status not in ('INTAKE', 'MELT_COMMITTED') then
      raise exception 'Trạng thái không cho phép tạo phiếu cam kết nấu' using errcode = 'P0001';
    end if;

    if v_buy.melt_commitment_no is null then
      v_no := 'PCN' || to_char((now() at time zone 'Asia/Ho_Chi_Minh'), 'YYYYMMDD')
        || '-' || lpad(nextval('public.pos_buy_doc_seq')::text, 3, '0');
    else
      v_no := v_buy.melt_commitment_no;
    end if;

    update public.pos_buys
    set melt_commitment_no = v_no, workflow_status = 'MELT_COMMITTED'
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (v_actor, 'BUY_MELT_COMMITMENT', 'buy', v_buy.id, 'Phiếu cam kết nấu ' || v_no,
      jsonb_build_object('melt_commitment_no', v_no));

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true, 'buyId', v_buy.id, 'meltCommitmentNo', v_no, 'workflowStatus', 'MELT_COMMITTED'
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_issue_melt_commitment(uuid, text) from public, anon;
grant execute on function public.pos_issue_melt_commitment(uuid, text) to authenticated;

create or replace function public.pos_start_buy_melting(
  p_buy_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_buy public.pos_buys%rowtype;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'start_buy_melting');
  if v_cached is not null then return v_cached; end if;

  begin
    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status not in ('MELT_COMMITTED', 'MELTING') then
      raise exception 'Cần có phiếu cam kết nấu trước khi nấu' using errcode = 'P0001';
    end if;

    update public.pos_buys
    set workflow_status = 'MELTING',
        melting_started_at = coalesce(melting_started_at, now())
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (v_actor, 'BUY_MELTING', 'buy', v_buy.id, 'Bắt đầu nấu vàng ' || v_buy.buy_no, '{}'::jsonb);

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true, 'buyId', v_buy.id, 'workflowStatus', 'MELTING'
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_start_buy_melting(uuid, text) from public, anon;
grant execute on function public.pos_start_buy_melting(uuid, text) to authenticated;

create or replace function public.pos_set_buy_melt_weights(
  p_buy_id uuid,
  p_items jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_buy public.pos_buys%rowtype;
  v_row record;
  v_total bigint := 0;
  v_line bigint;
  v_item public.pos_buy_items%rowtype;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'set_buy_melt_weights');
  if v_cached is not null then return v_cached; end if;

  begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Danh sách khối lượng sau nấu trống' using errcode = '22023';
    end if;

    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status not in ('MELTING', 'WEIGHT_ENTERED', 'AWAITING_CONFIRM') then
      raise exception 'Chỉ nhập KL sau nấu khi đang nấu / chờ xác nhận' using errcode = 'P0001';
    end if;

    for v_row in
      select * from jsonb_to_recordset(p_items) as x(
        item_id uuid,
        weight_after_chi numeric
      )
    loop
      if v_row.item_id is null then
        raise exception 'item_id bắt buộc' using errcode = '22023';
      end if;
      if v_row.weight_after_chi is null or v_row.weight_after_chi <= 0 then
        raise exception 'Khối lượng sau nấu phải > 0' using errcode = '22023';
      end if;

      select * into v_item from public.pos_buy_items where id = v_row.item_id and buy_id = v_buy.id for update;
      if not found then
        raise exception 'Dòng hàng không thuộc giao dịch' using errcode = 'P0001';
      end if;

      v_line := (v_item.unit_price_dong::numeric * v_row.weight_after_chi * v_item.quantity)::bigint;
      update public.pos_buy_items
      set weight_after_chi = v_row.weight_after_chi,
          weight_chi = v_row.weight_after_chi,
          total_price_dong = v_line
      where id = v_item.id;
    end loop;

    select coalesce(sum(total_price_dong), 0) into v_total
    from public.pos_buy_items where buy_id = v_buy.id;

    update public.pos_buys
    set total_dong = v_total,
        remaining_dong = v_total - paid_dong,
        intended_paid_dong = least(coalesce(intended_paid_dong, v_total), v_total),
        workflow_status = 'AWAITING_CONFIRM'
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (v_actor, 'BUY_MELT_WEIGHT', 'buy', v_buy.id, 'Nhập KL sau nấu ' || v_buy.buy_no,
      jsonb_build_object('total_dong', v_total));

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true, 'buyId', v_buy.id, 'totalDong', v_total, 'workflowStatus', 'AWAITING_CONFIRM'
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_set_buy_melt_weights(uuid, jsonb, text) from public, anon;
grant execute on function public.pos_set_buy_melt_weights(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Confirm agree (finalize like old complete) / disagree (cancel)
-- ---------------------------------------------------------------------------
create or replace function public.pos_confirm_buy_melt(
  p_buy_id uuid,
  p_agree boolean,
  p_idempotency_key text,
  p_payment_method text default null,
  p_paid_dong bigint default null,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_cached jsonb;
  v_buy public.pos_buys%rowtype;
  v_item record;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_due date;
  v_method text;
  v_form02 text;
  v_cost_piece bigint;
  v_brand text;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'confirm_buy_melt');
  if v_cached is not null then return v_cached; end if;

  begin
    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status not in ('AWAITING_CONFIRM', 'WEIGHT_ENTERED') then
      raise exception 'Cần nhập khối lượng sau nấu trước khi xác nhận' using errcode = 'P0001';
    end if;

    if not coalesce(p_agree, false) then
      -- Keep remaining_dong = total - paid (constraint pos_buys_remaining_eq).
      update public.pos_buys
      set status = 'CANCELLED', workflow_status = 'CANCELLED'
      where id = v_buy.id;

      insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
      values (v_actor, 'BUY_MELT_CANCEL', 'buy', v_buy.id,
        'Khách không đồng ý — hủy ' || v_buy.buy_no, '{}'::jsonb);

      return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
        'ok', true, 'buyId', v_buy.id, 'status', 'CANCELLED', 'workflowStatus', 'CANCELLED'
      ));
    end if;

    -- Agree: ensure every line has after-melt weight
    if exists (
      select 1 from public.pos_buy_items
      where buy_id = v_buy.id and (weight_after_chi is null or weight_after_chi <= 0)
    ) then
      raise exception 'Thiếu khối lượng sau nấu trên một hoặc nhiều dòng' using errcode = '22023';
    end if;

    v_method := coalesce(nullif(trim(p_payment_method), ''), v_buy.payment_method);
    if v_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;

    v_paid := coalesce(p_paid_dong, v_buy.intended_paid_dong, v_buy.total_dong);
    if v_paid < 0 or v_paid > v_buy.total_dong then
      raise exception 'Số tiền đã trả không hợp lệ' using errcode = '22023';
    end if;
    v_remaining := v_buy.total_dong - v_paid;
    v_due := case when v_remaining = 0 then null else coalesce(p_due_date, v_buy.due_date) end;
    if v_remaining > 0 and v_due is null then
      raise exception 'Phải có ngày hẹn trả khi chưa trả đủ' using errcode = '22023';
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_buy.total_dong, v_due);

    v_form02 := coalesce(
      v_buy.form02_no,
      'BK' || to_char((now() at time zone 'Asia/Ho_Chi_Minh'), 'YYYYMMDD')
        || '-' || lpad(nextval('public.pos_buy_doc_seq')::text, 3, '0')
    );

    for v_item in
      select * from public.pos_buy_items where buy_id = v_buy.id
    loop
      v_cost_piece := (v_item.total_price_dong::numeric / greatest(v_item.quantity, 1))::bigint;
      v_brand := v_item.brand_name;
      perform pos_private.apply_stock_change(
        v_item.sku_id,
        v_item.quantity,
        'PURCHASE_RECEIVED',
        'Mua vào từ khách ' || v_buy.buy_no,
        'CUSTOMER_BUY',
        v_buy.id,
        v_actor,
        v_cost_piece,
        v_brand
      );
    end loop;

    if v_paid > 0 then
      insert into public.pos_buy_payments (
        buy_id, amount_dong, payment_method, paid_at, actor_email, note
      ) values (
        v_buy.id, v_paid, v_method, now(), v_actor, 'Thanh toán khi xác nhận mua sau nấu'
      );
    end if;

    update public.pos_buys
    set
      status = 'COMPLETED',
      workflow_status = 'COMPLETED',
      payment_method = v_method,
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      due_date = v_due,
      form02_no = v_form02,
      completed_at = now()
    where id = v_buy.id;

    perform pos_private.upsert_payable_for_buy(v_buy.id);

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_COMPLETE', 'buy', v_buy.id,
      'Hoàn tất mua vào sau nấu ' || v_buy.buy_no,
      jsonb_build_object(
        'buy_no', v_buy.buy_no,
        'form02_no', v_form02,
        'total_dong', v_buy.total_dong,
        'paid_dong', v_paid
      )
    );

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true,
      'buyId', v_buy.id,
      'buyNo', v_buy.buy_no,
      'status', 'COMPLETED',
      'workflowStatus', 'COMPLETED',
      'form02No', v_form02,
      'paidDong', v_paid,
      'remainingDong', v_remaining,
      'paymentStatus', v_pay_status
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_confirm_buy_melt(uuid, boolean, text, text, bigint, date)
  from public, anon;
grant execute on function public.pos_confirm_buy_melt(uuid, boolean, text, text, bigint, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Refresh get/list buys for workflow fields
-- ---------------------------------------------------------------------------
create or replace function public.pos_get_buy(p_buy_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buy jsonb;
  v_items jsonb;
  v_payments jsonb;
begin
  perform pos_private.require_pos_user();

  select jsonb_build_object(
    'id', b.id,
    'buyNo', b.buy_no,
    'customerId', b.customer_id,
    'customerName', coalesce(b.customer_name_snapshot, c.name),
    'customerPhone', coalesce(b.customer_phone_snapshot, c.phone),
    'customerNo', c.customer_no,
    'customerCitizenId', coalesce(b.customer_citizen_id_snapshot, c.citizen_id),
    'customerAddress', coalesce(b.customer_address_snapshot, c.address),
    'customerBankAccount', b.customer_bank_account_snapshot,
    'customerBankHolder', b.customer_bank_holder_snapshot,
    'totalDong', b.total_dong,
    'paidDong', b.paid_dong,
    'remainingDong', b.remaining_dong,
    'paymentStatus', b.payment_status,
    'paymentMethod', b.payment_method,
    'dueDate', b.due_date,
    'actorEmail', b.actor_email,
    'completedAt', b.completed_at,
    'note', b.note,
    'status', b.status,
    'workflowStatus', b.workflow_status,
    'meltCommitmentNo', b.melt_commitment_no,
    'form02No', b.form02_no,
    'meltingStartedAt', b.melting_started_at,
    'attachmentPdfPath', b.attachment_pdf_path
  )
  into v_buy
  from public.pos_buys b
  join public.pos_customers c on c.id = b.customer_id
  where b.id = p_buy_id;

  if v_buy is null then
    raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'skuId', i.sku_id,
    'productName', i.product_name_snapshot,
    'goldType', i.gold_type,
    'goldAge', i.gold_age,
    'quantity', i.quantity,
    'weightChi', i.weight_chi,
    'weightBeforeChi', coalesce(i.weight_before_chi, i.weight_chi),
    'weightAfterChi', i.weight_after_chi,
    'unitPriceDong', i.unit_price_dong,
    'totalPriceDong', i.total_price_dong,
    'isMarketGold', i.is_market_gold,
    'priceException', i.price_exception,
    'brandId', i.brand_id,
    'brandName', i.brand_name
  ) order by i.id), '[]'::jsonb)
  into v_items
  from public.pos_buy_items i
  where i.buy_id = p_buy_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'amountDong', p.amount_dong,
    'paymentMethod', p.payment_method,
    'paidAt', p.paid_at,
    'actorEmail', p.actor_email,
    'note', p.note
  ) order by p.paid_at), '[]'::jsonb)
  into v_payments
  from public.pos_buy_payments p
  where p.buy_id = p_buy_id;

  return v_buy || jsonb_build_object('items', v_items, 'payments', v_payments);
end;
$$;

-- List buys: include PROCESSING + COMPLETED (exclude cancelled noise by default via status filter in app)
create or replace function public.pos_list_buys(
  p_limit integer default 50,
  p_offset integer default 0,
  p_payment_status text default null,
  p_q text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_rows jsonb;
begin
  perform pos_private.require_pos_user();

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_rows
  from (
    select
      b.id,
      b.buy_no as "buyNo",
      b.customer_id as "customerId",
      coalesce(b.customer_name_snapshot, c.name) as "customerName",
      coalesce(b.customer_phone_snapshot, c.phone) as "customerPhone",
      b.total_dong as "totalDong",
      b.paid_dong as "paidDong",
      b.remaining_dong as "remainingDong",
      b.payment_status as "paymentStatus",
      b.payment_method as "paymentMethod",
      b.due_date as "dueDate",
      b.actor_email as "actorEmail",
      b.completed_at as "completedAt",
      b.note,
      b.status,
      b.workflow_status as "workflowStatus",
      b.melt_commitment_no as "meltCommitmentNo",
      b.form02_no as "form02No",
      b.melting_started_at as "meltingStartedAt",
      b.attachment_pdf_path as "attachmentPdfPath"
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where b.status in ('PROCESSING', 'COMPLETED')
      and (p_payment_status is null or b.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(b.buy_no) like '%' || v_q || '%'
        or lower(coalesce(b.customer_name_snapshot, c.name)) like '%' || v_q || '%'
        or lower(coalesce(b.customer_phone_snapshot, c.phone)) like '%' || v_q || '%'
      )
    order by coalesce(b.completed_at, b.created_at) desc
    limit greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;

  return v_rows;
end;
$$;
