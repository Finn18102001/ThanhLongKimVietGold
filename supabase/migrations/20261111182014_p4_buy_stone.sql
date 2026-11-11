-- Phase 4.1 — Vàng kèm đá ở luồng MUA (docs/pos-big-update/P4-00-GOLD-STONE.md, C1–C3)
-- Additive: cột mới có default, dòng cũ giữ nguyên (đá = 0, gold_amount_dong null = total_price_dong).
-- Bảng đã có grant mức bảng (authenticated SELECT, service_role) → cột mới tự được expose (§32.1).

-- 0. Backup (00-BACKUP-ROLLBACK.md §3)
create table if not exists tlkv_backup_20261110.pos_buy_items__p4 as table public.pos_buy_items;
create table if not exists tlkv_backup_20261110.pos_skus__p4 as table public.pos_skus;
create table if not exists tlkv_backup_20261110._routines__p4 as
select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition, now() as saved_at
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'pos_private' and p.proname in (
         'create_buy_intake', 'ensure_market_gold_sku', 'void_buy', 'compute_unit_price', 'complete_sale'))
   or (n.nspname = 'public' and p.proname in (
         'pos_create_buy_intake', 'pos_set_buy_melt_weights', 'pos_get_buy', 'pos_complete_buy_melt',
         'pos_complete_sale', 'pos_complete_held_sale', 'pos_record_label_print', 'pos_list_form02',
         'pos_export_form02', 'pos_export_documents', 'pos_export_transactions', 'pos_list_market_gold_stock'));

-- 1. Cột
alter table public.pos_buy_items
  add column if not exists stone_weight_chi numeric(12,4) not null default 0,
  add column if not exists stone_price_dong bigint not null default 0,
  add column if not exists gold_amount_dong bigint;

alter table public.pos_buy_items
  drop constraint if exists pos_buy_items_stone_chk;
alter table public.pos_buy_items
  add constraint pos_buy_items_stone_chk check (
    stone_weight_chi >= 0 and stone_price_dong >= 0 and (gold_amount_dong is null or gold_amount_dong >= 0)
  );

comment on column public.pos_buy_items.stone_weight_chi is 'TL đá / 1 chiếc (chỉ). Snapshot lúc mua.';
comment on column public.pos_buy_items.stone_price_dong is 'Giá đá / 1 chiếc (VND). Snapshot lúc mua. total_price_dong = gold_amount_dong + stone_price_dong * quantity.';
comment on column public.pos_buy_items.gold_amount_dong is 'Tiền vàng cả dòng (VND). Null = dòng trước Phase 4 (toàn bộ total_price_dong là vàng).';

alter table public.pos_skus
  add column if not exists stone_weight_chi numeric(12,4) not null default 0,
  add column if not exists stone_price_dong bigint not null default 0;

alter table public.pos_skus
  drop constraint if exists pos_skus_stone_chk;
alter table public.pos_skus
  add constraint pos_skus_stone_chk check (stone_weight_chi >= 0 and stone_price_dong >= 0);

comment on column public.pos_skus.stone_weight_chi is 'TL đá / 1 chiếc (chỉ). weight_chi = TL vàng.';
comment on column public.pos_skus.stone_price_dong is 'Giá đá mặc định / 1 chiếc khi bán (VND). Sửa được trên dòng bán, không đổi lịch sử mua.';

-- 2. Tiếp nhận mua: nhận TL đá + giá đá / chiếc, tổng dòng = vàng + đá × SL
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
set search_path to 'public'
as $function$
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
  v_gold_total bigint;
  v_stone_w numeric;
  v_stone_p bigint;
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
        price_row_id text,
        stone_weight_chi numeric,
        stone_price_dong bigint
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
      v_stone_w := coalesce(v_item.stone_weight_chi, 0);
      v_stone_p := coalesce(v_item.stone_price_dong, 0);
      if v_stone_w < 0 then
        raise exception 'Trọng lượng đá không hợp lệ' using errcode = '22023';
      end if;
      if v_stone_p < 0 then
        raise exception 'Giá tiền đá không hợp lệ' using errcode = '22023';
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

      v_gold_total := (v_per_chi::numeric * v_item.weight_chi * v_item.quantity)::bigint;
      v_line_total := v_gold_total + v_stone_p * v_item.quantity;
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
        price_row_id text,
        stone_weight_chi numeric,
        stone_price_dong bigint
      )
    loop
      v_is_market := coalesce(v_item.is_market_gold, false);
      v_per_chi := v_item.unit_price_dong;
      v_stone_w := coalesce(v_item.stone_weight_chi, 0);
      v_stone_p := coalesce(v_item.stone_price_dong, 0);
      v_gold_total := (v_per_chi::numeric * v_item.weight_chi * v_item.quantity)::bigint;
      v_line_total := v_gold_total + v_stone_p * v_item.quantity;
      v_name := nullif(trim(coalesce(v_item.product_name, '')), '');

      if v_is_market then
        v_ref := null;
        v_diff := null;
        v_exception := false;
        v_sku_id := pos_private.ensure_market_gold_sku(
          v_name, v_item.gold_type, v_item.gold_age, v_item.weight_chi, v_item.price_row_id
        );
        if v_stone_w > 0 or v_stone_p > 0 then
          update public.pos_skus
          set stone_weight_chi = v_stone_w,
              stone_price_dong = v_stone_p
          where id = v_sku_id;
        end if;
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
        price_exception, difference_per_chi, brand_id, brand_name,
        stone_weight_chi, stone_price_dong, gold_amount_dong
      ) values (
        v_buy_id, v_sku_id, v_name, nullif(trim(coalesce(v_item.gold_type, '')), ''),
        nullif(trim(coalesce(v_item.gold_age, '')), ''),
        v_item.quantity, v_item.weight_chi, v_item.weight_chi, null,
        v_per_chi, v_line_total,
        v_ref, nullif(trim(coalesce(v_item.price_row_id, '')), ''),
        v_is_market, v_exception, v_diff, v_brand_id, v_brand_name,
        v_stone_w, v_stone_p, v_gold_total
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
$function$;

-- 3. Nhập KL sau nấu: chỉ tính lại phần vàng, giữ tiền đá (C3).
--    SKU vàng thị trường (1 SKU / dòng mua) nhận TL vàng sau nấu để giá bán theo bảng giá (C5) đúng TL thật.
create or replace function public.pos_set_buy_melt_weights(p_buy_id uuid, p_items jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text;
  v_cached jsonb;
  v_buy public.pos_buys%rowtype;
  v_row record;
  v_total bigint := 0;
  v_gold bigint;
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
    if v_buy.workflow_status not in ('MELTING', 'WEIGHT_ENTERED') then
      raise exception 'Chỉ nhập KL sau nấu khi đang nấu / đã nhập KL' using errcode = 'P0001';
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

      v_gold := (v_item.unit_price_dong::numeric * v_row.weight_after_chi * v_item.quantity)::bigint;
      v_line := v_gold + coalesce(v_item.stone_price_dong, 0) * v_item.quantity;
      update public.pos_buy_items
      set weight_after_chi = v_row.weight_after_chi,
          weight_chi = v_row.weight_after_chi,
          gold_amount_dong = v_gold,
          total_price_dong = v_line
      where id = v_item.id;

      if v_item.is_market_gold and v_item.sku_id is not null then
        update public.pos_skus
        set weight_chi = v_row.weight_after_chi
        where id = v_item.sku_id and is_market_gold;
      end if;
    end loop;

    select coalesce(sum(total_price_dong), 0) into v_total
    from public.pos_buy_items where buy_id = v_buy.id;

    update public.pos_buys
    set total_dong = v_total,
        remaining_dong = v_total - paid_dong,
        intended_paid_dong = least(coalesce(intended_paid_dong, v_total), v_total),
        workflow_status = 'WEIGHT_ENTERED'
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (v_actor, 'BUY_MELT_WEIGHT', 'buy', v_buy.id, 'Nhập KL sau nấu ' || v_buy.buy_no,
      jsonb_build_object('total_dong', v_total));

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true, 'buyId', v_buy.id, 'totalDong', v_total, 'workflowStatus', 'WEIGHT_ENTERED'
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

-- 4. Đọc phiếu mua: thêm TL đá, giá đá / chiếc, tiền vàng cả dòng
create or replace function public.pos_get_buy(p_buy_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_buy jsonb;
  v_items jsonb;
  v_payments jsonb;
  v_attachments jsonb;
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
    'createdAt', b.created_at,
    'note', b.note,
    'status', b.status,
    'workflowStatus', b.workflow_status,
    'meltCommitmentNo', b.melt_commitment_no,
    'form02No', b.form02_no,
    'meltingStartedAt', b.melting_started_at,
    'attachmentPdfPath', b.attachment_pdf_path,
    'intendedPaidDong', b.intended_paid_dong,
    'skipMelt', coalesce(b.skip_melt, false)
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
    'brandName', i.brand_name,
    'stoneWeightChi', coalesce(i.stone_weight_chi, 0),
    'stonePriceDong', coalesce(i.stone_price_dong, 0),
    'goldAmountDong', coalesce(i.gold_amount_dong, i.total_price_dong - coalesce(i.stone_price_dong, 0) * i.quantity)
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'storagePath', a.storage_path,
    'fileName', a.file_name,
    'mimeType', a.mime_type,
    'byteSize', a.byte_size,
    'docKind', a.doc_kind,
    'actorEmail', a.actor_email,
    'createdAt', a.created_at
  ) order by a.created_at), '[]'::jsonb)
  into v_attachments
  from public.pos_buy_attachments a
  where a.buy_id = p_buy_id;

  return v_buy || jsonb_build_object(
    'items', v_items,
    'payments', v_payments,
    'attachments', v_attachments
  );
end;
$function$;
