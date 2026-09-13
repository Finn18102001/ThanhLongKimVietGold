-- Direct-buy (skip melt) for configured SKUs. Melt flow otherwise unchanged.

alter table public.pos_skus
  add column if not exists allow_direct_buy boolean not null default false;

comment on column public.pos_skus.allow_direct_buy is
  'When true, staff may skip melt/purity and jump to AWAITING_CONFIRM on buy-from-customer.';

alter table public.pos_buys
  add column if not exists skip_melt boolean not null default false;

comment on column public.pos_buys.skip_melt is
  'True when this buy skipped melt/purity (direct repurchase of branded goods).';

-- Seed config for known direct-buy product families (not UI hard-code).
update public.pos_skus
set allow_direct_buy = true
where is_active
  and (
    name ilike 'Bông Lúa Vàng%'
    or name ilike 'Kim Gia Bảo%'
    or name ilike 'Nhẫn Tròn Kim Việt%'
  );

-- Jump INTAKE → AWAITING_CONFIRM when all lines allow direct buy.
create or replace function public.pos_buy_skip_melt(
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
  v_bad integer;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'buy_skip_melt');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then
      raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001';
    end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status <> 'INTAKE' then
      raise exception 'Chỉ bỏ qua nấu được từ bước tiếp nhận' using errcode = '22023';
    end if;
    if coalesce(v_buy.skip_melt, false) then
      return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
        'ok', true,
        'buyId', v_buy.id,
        'buyNo', v_buy.buy_no,
        'workflowStatus', v_buy.workflow_status,
        'skipMelt', true
      ));
    end if;

    select count(*)::integer into v_bad
    from public.pos_buy_items i
    left join public.pos_skus s on s.id = i.sku_id
    where i.buy_id = v_buy.id
      and (
        i.sku_id is null
        or coalesce(i.is_market_gold, false)
        or not coalesce(s.allow_direct_buy, false)
      );

    if coalesce(v_bad, 0) > 0 then
      raise exception 'Có sản phẩm không được phép mua trực tiếp — bắt buộc flow nấu'
        using errcode = '22023';
    end if;

    update public.pos_buy_items
    set
      weight_after_chi = coalesce(weight_before_chi, weight_chi),
      weight_chi = coalesce(weight_before_chi, weight_chi)
    where buy_id = v_buy.id;

    update public.pos_buys
    set
      skip_melt = true,
      workflow_status = 'AWAITING_CONFIRM'
    where id = v_buy.id
    returning * into v_buy;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor,
      'BUY_SKIP_MELT',
      'buy',
      v_buy.id,
      'Bỏ qua nấu — xác nhận KH trực tiếp ' || v_buy.buy_no,
      jsonb_build_object('buy_no', v_buy.buy_no, 'skip_melt', true)
    );

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true,
      'buyId', v_buy.id,
      'buyNo', v_buy.buy_no,
      'status', 'PROCESSING',
      'workflowStatus', 'AWAITING_CONFIRM',
      'skipMelt', true
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_buy_skip_melt(uuid, text) from public, anon;
grant execute on function public.pos_buy_skip_melt(uuid, text) to authenticated;

-- Confirm: purity attachment not required when skip_melt.
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
  v_paid bigint;
  v_remaining bigint;
  v_due date;
  v_method text;
  v_total bigint;
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
      raise exception 'Chưa tới bước xác nhận khách' using errcode = 'P0001';
    end if;

    if not coalesce(p_agree, false) then
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

    if exists (
      select 1 from public.pos_buy_items
      where buy_id = v_buy.id and (weight_after_chi is null or weight_after_chi <= 0)
    ) then
      raise exception 'Thiếu khối lượng sau nấu trên một hoặc nhiều dòng' using errcode = '22023';
    end if;

    if not coalesce(v_buy.skip_melt, false) then
      if not exists (
        select 1 from public.pos_buy_attachments a
        where a.buy_id = v_buy.id and a.doc_kind = 'PURITY_TEST'
      ) then
        raise exception 'Bắt buộc upload Phiếu kiểm tra hàm lượng trước khi đồng ý' using errcode = '22023';
      end if;
    end if;

    select coalesce(sum(total_price_dong), 0) into v_total
    from public.pos_buy_items where buy_id = v_buy.id;

    if v_total <> v_buy.total_dong then
      update public.pos_buys
      set total_dong = v_total,
          remaining_dong = v_total - paid_dong,
          intended_paid_dong = least(coalesce(intended_paid_dong, v_total), v_total)
      where id = v_buy.id
      returning * into v_buy;
    end if;

    v_method := coalesce(nullif(trim(p_payment_method), ''), v_buy.payment_method);
    if v_method not in ('CASH', 'TRANSFER', 'CARD') then
      raise exception 'Phương thức thanh toán không hợp lệ' using errcode = '22023';
    end if;

    if p_paid_dong is not null then
      v_paid := p_paid_dong;
    else
      v_paid := coalesce(v_buy.intended_paid_dong, v_buy.total_dong);
    end if;

    if v_paid < 0 or v_paid > v_buy.total_dong then
      raise exception 'Số tiền đã trả không hợp lệ' using errcode = '22023';
    end if;
    v_remaining := v_buy.total_dong - v_paid;
    v_due := case when v_remaining = 0 then null else coalesce(p_due_date, v_buy.due_date) end;
    if v_remaining > 0 and v_due is null then
      raise exception 'Phải có ngày hẹn trả khi chưa trả đủ' using errcode = '22023';
    end if;

    update public.pos_buys
    set
      workflow_status = 'INVOICE_ISSUED',
      payment_method = v_method,
      intended_paid_dong = v_paid,
      remaining_dong = v_buy.total_dong - paid_dong,
      due_date = v_due
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_INVOICE_ISSUED', 'buy', v_buy.id,
      'Khách đồng ý — tạo hóa đơn mua ' || v_buy.buy_no,
      jsonb_build_object(
        'buy_no', v_buy.buy_no,
        'intended_paid_dong', v_paid,
        'payment_method', v_method,
        'skip_melt', coalesce(v_buy.skip_melt, false)
      )
    );

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true,
      'buyId', v_buy.id,
      'buyNo', v_buy.buy_no,
      'status', 'PROCESSING',
      'workflowStatus', 'INVOICE_ISSUED',
      'intendedPaidDong', v_paid
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

-- Expose skipMelt on get_buy
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
$$;

revoke all on function public.pos_get_buy(uuid) from public, anon;
grant execute on function public.pos_get_buy(uuid) to authenticated;
