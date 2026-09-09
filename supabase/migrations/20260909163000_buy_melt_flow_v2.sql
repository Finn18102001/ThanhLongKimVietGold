-- Buy melt flow v2:
-- Agree → INVOICE_ISSUED (no stock/cash)
-- Confirm invoice → FORM02_READY (+ form02_no)
-- Complete → COMPLETED (+ stock + cash + payable)
-- Weights → WEIGHT_ENTERED; purity upload required → AWAITING_CONFIRM
-- Attachments: doc_kind + image/webp allowed (PDF stays PDF)

-- ---------------------------------------------------------------------------
-- 1) Workflow statuses
-- ---------------------------------------------------------------------------
alter table public.pos_buys
  drop constraint if exists pos_buys_workflow_status_chk;

alter table public.pos_buys
  add constraint pos_buys_workflow_status_chk
  check (workflow_status = any (array[
    'INTAKE'::text,
    'MELT_COMMITTED'::text,
    'MELTING'::text,
    'WEIGHT_ENTERED'::text,
    'AWAITING_CONFIRM'::text,
    'INVOICE_ISSUED'::text,
    'FORM02_READY'::text,
    'COMPLETED'::text,
    'CANCELLED'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) Attachment kind + wider MIME (images/webp + pdf)
-- ---------------------------------------------------------------------------
alter table public.pos_buy_attachments
  add column if not exists doc_kind text not null default 'RELATED';

alter table public.pos_buy_attachments
  drop constraint if exists pos_buy_attachments_doc_kind_chk;

alter table public.pos_buy_attachments
  add constraint pos_buy_attachments_doc_kind_chk
  check (doc_kind = any (array[
    'PURITY_TEST'::text,
    'RELATED'::text,
    'SIGNED_PDF'::text
  ]));

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]::text[]
where id = 'buy-attachments';

alter table public.pos_buy_attachments
  drop constraint if exists pos_buy_attachments_mime_chk;

alter table public.pos_buy_attachments
  add constraint pos_buy_attachments_mime_chk
  check (mime_type = any (array[
    'application/pdf'::text,
    'image/jpeg'::text,
    'image/png'::text,
    'image/webp'::text,
    'image/heic'::text,
    'image/heif'::text
  ]));

-- ---------------------------------------------------------------------------
-- 3) Weights → WEIGHT_ENTERED (not AWAITING_CONFIRM)
-- ---------------------------------------------------------------------------
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
$$;

-- ---------------------------------------------------------------------------
-- 4) Attach file (PDF or image/webp) with doc_kind
-- ---------------------------------------------------------------------------
create or replace function public.pos_attach_buy_file(
  p_buy_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint default null,
  p_doc_kind text default 'RELATED',
  p_idempotency_key text default null
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
  v_path text;
  v_name text;
  v_mime text;
  v_kind text;
  v_id uuid;
  v_ext text;
begin
  v_actor := pos_private.require_pos_user();
  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    v_cached := pos_private.begin_idempotency(trim(p_idempotency_key), 'attach_buy_file');
    if v_cached is not null then return v_cached; end if;
  end if;

  begin
    v_path := nullif(trim(coalesce(p_storage_path, '')), '');
    v_name := nullif(trim(coalesce(p_file_name, '')), '');
    v_mime := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
    v_kind := upper(nullif(trim(coalesce(p_doc_kind, '')), ''));
    if v_path is null or v_name is null then
      raise exception 'Thiếu đường dẫn hoặc tên file' using errcode = '22023';
    end if;
    if v_path not like (p_buy_id::text || '/%') then
      raise exception 'Đường dẫn file không hợp lệ' using errcode = '22023';
    end if;
    if v_kind is null or v_kind not in ('PURITY_TEST', 'RELATED', 'SIGNED_PDF') then
      raise exception 'Loại tài liệu không hợp lệ' using errcode = '22023';
    end if;

    v_ext := lower(coalesce(substring(v_name from '\.([^.]+)$'), ''));
    if v_mime is null or v_mime = 'application/octet-stream' then
      if v_ext = 'pdf' then v_mime := 'application/pdf';
      elsif v_ext in ('jpg', 'jpeg') then v_mime := 'image/jpeg';
      elsif v_ext = 'png' then v_mime := 'image/png';
      elsif v_ext = 'webp' then v_mime := 'image/webp';
      end if;
    end if;

    if v_mime is null or v_mime not in (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
    ) then
      raise exception 'Chỉ chấp nhận PDF hoặc ảnh (JPEG/PNG/WebP)' using errcode = '22023';
    end if;

    if v_mime = 'application/pdf' and v_ext <> 'pdf' then
      raise exception 'Tên file PDF phải kết thúc bằng .pdf' using errcode = '22023';
    end if;

    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then
      raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001';
    end if;
    if v_buy.status not in ('PROCESSING', 'COMPLETED') then
      raise exception 'Không đính kèm file cho trạng thái hiện tại' using errcode = 'P0001';
    end if;

    if v_kind = 'PURITY_TEST' then
      if v_buy.workflow_status not in ('WEIGHT_ENTERED', 'AWAITING_CONFIRM') then
        raise exception 'Chỉ upload phiếu kiểm tra hàm lượng sau khi nhập KL sau nấu' using errcode = 'P0001';
      end if;
    end if;

    if v_kind = 'RELATED' and v_buy.workflow_status not in (
      'INVOICE_ISSUED', 'FORM02_READY', 'COMPLETED'
    ) and v_buy.status <> 'COMPLETED' then
      raise exception 'Chỉ upload tài liệu liên quan từ bước hóa đơn / phiếu 02' using errcode = 'P0001';
    end if;

    insert into public.pos_buy_attachments (
      buy_id, storage_path, file_name, mime_type, byte_size, actor_email, doc_kind
    ) values (
      v_buy.id, v_path, v_name, v_mime, p_byte_size, v_actor, v_kind
    )
    returning id into v_id;

    -- Keep legacy path pointer for latest PDF-like purity/signed docs
    if v_mime = 'application/pdf' or v_kind in ('PURITY_TEST', 'SIGNED_PDF') then
      update public.pos_buys
      set attachment_pdf_path = v_path
      where id = v_buy.id;
    end if;

    if v_kind = 'PURITY_TEST' and v_buy.workflow_status = 'WEIGHT_ENTERED' then
      update public.pos_buys
      set workflow_status = 'AWAITING_CONFIRM'
      where id = v_buy.id;
      v_buy.workflow_status := 'AWAITING_CONFIRM';
    end if;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_ATTACH_FILE', 'buy', v_buy.id,
      'Đính kèm tài liệu ' || v_buy.buy_no,
      jsonb_build_object(
        'storage_path', v_path,
        'file_name', v_name,
        'mime_type', v_mime,
        'doc_kind', v_kind,
        'workflow_status', v_buy.workflow_status
      )
    );

    if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
      return pos_private.finish_idempotency(trim(p_idempotency_key), jsonb_build_object(
        'ok', true,
        'attachmentId', v_id,
        'buyId', v_buy.id,
        'storagePath', v_path,
        'docKind', v_kind,
        'workflowStatus', v_buy.workflow_status
      ));
    end if;

    return jsonb_build_object(
      'ok', true,
      'attachmentId', v_id,
      'buyId', v_buy.id,
      'storagePath', v_path,
      'docKind', v_kind,
      'workflowStatus', v_buy.workflow_status
    );
  exception when others then
    if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
      perform pos_private.clear_pending_idempotency(trim(p_idempotency_key));
    end if;
    raise;
  end;
end;
$$;

revoke all on function public.pos_attach_buy_file(uuid, text, text, text, bigint, text, text) from public;
grant execute on function public.pos_attach_buy_file(uuid, text, text, text, bigint, text, text) to authenticated;

-- Keep legacy PDF wrapper → RELATED/SIGNED as PDF
create or replace function public.pos_attach_buy_pdf(
  p_buy_id uuid,
  p_storage_path text,
  p_file_name text,
  p_byte_size bigint default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.pos_attach_buy_file(
    p_buy_id,
    p_storage_path,
    p_file_name,
    'application/pdf',
    p_byte_size,
    'SIGNED_PDF',
    p_idempotency_key
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Agree → INVOICE_ISSUED only (no stock/cash/form02)
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

    if not exists (
      select 1 from public.pos_buy_attachments a
      where a.buy_id = v_buy.id and a.doc_kind = 'PURITY_TEST'
    ) then
      raise exception 'Bắt buộc upload Phiếu kiểm tra hàm lượng trước khi đồng ý' using errcode = '22023';
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

    -- Keep paid_dong = 0 until final complete (no cash/stock yet).
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
        'payment_method', v_method
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

-- ---------------------------------------------------------------------------
-- 6) Confirm invoice → FORM02_READY (+ form02_no)
-- ---------------------------------------------------------------------------
create or replace function public.pos_confirm_buy_invoice(
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
  v_form02 text;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'confirm_buy_invoice');
  if v_cached is not null then return v_cached; end if;

  begin
    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status <> 'INVOICE_ISSUED' then
      raise exception 'Chỉ xác nhận hóa đơn khi đang ở bước Hóa đơn bán hàng' using errcode = 'P0001';
    end if;

    v_form02 := coalesce(
      v_buy.form02_no,
      'BK' || to_char((now() at time zone 'Asia/Ho_Chi_Minh'), 'YYYYMMDD')
        || '-' || lpad(nextval('public.pos_buy_doc_seq')::text, 3, '0')
    );

    update public.pos_buys
    set workflow_status = 'FORM02_READY',
        form02_no = v_form02
    where id = v_buy.id;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_FORM02_READY', 'buy', v_buy.id,
      'Xác nhận hóa đơn — tạo Phiếu 02 ' || v_buy.buy_no,
      jsonb_build_object('form02_no', v_form02)
    );

    return pos_private.finish_idempotency(p_idempotency_key, jsonb_build_object(
      'ok', true,
      'buyId', v_buy.id,
      'buyNo', v_buy.buy_no,
      'workflowStatus', 'FORM02_READY',
      'form02No', v_form02
    ));
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$$;

revoke all on function public.pos_confirm_buy_invoice(uuid, text) from public;
grant execute on function public.pos_confirm_buy_invoice(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Complete → stock + cash + COMPLETED
-- ---------------------------------------------------------------------------
create or replace function public.pos_complete_buy_melt(
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
  v_item record;
  v_paid bigint;
  v_remaining bigint;
  v_pay_status text;
  v_cost_piece bigint;
  v_brand text;
begin
  v_actor := pos_private.require_pos_user();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'complete_buy_melt');
  if v_cached is not null then return v_cached; end if;

  begin
    select * into v_buy from public.pos_buys where id = p_buy_id for update;
    if not found then raise exception 'Phiếu mua không tồn tại' using errcode = 'P0001'; end if;
    if v_buy.status <> 'PROCESSING' then
      raise exception 'Giao dịch không còn đang xử lý' using errcode = 'P0001';
    end if;
    if v_buy.workflow_status <> 'FORM02_READY' then
      raise exception 'Chỉ hoàn tất khi đang ở bước Phiếu 02' using errcode = 'P0001';
    end if;
    if v_buy.form02_no is null then
      raise exception 'Thiếu số Phiếu 02' using errcode = 'P0001';
    end if;

    v_paid := coalesce(v_buy.intended_paid_dong, v_buy.total_dong);
    if v_paid < 0 or v_paid > v_buy.total_dong then
      raise exception 'Số tiền thanh toán dự kiến không hợp lệ' using errcode = '22023';
    end if;
    v_remaining := v_buy.total_dong - v_paid;
    if v_remaining > 0 and v_buy.due_date is null then
      raise exception 'Phải có ngày hẹn trả khi chưa trả đủ' using errcode = '22023';
    end if;
    v_pay_status := pos_private.derive_sale_payment_status(v_paid, v_buy.total_dong, v_buy.due_date);

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
        v_buy.id, v_paid, v_buy.payment_method, now(), v_actor, 'Thanh toán khi hoàn tất mua sau nấu'
      );
    end if;

    update public.pos_buys
    set
      status = 'COMPLETED',
      workflow_status = 'COMPLETED',
      paid_dong = v_paid,
      remaining_dong = v_remaining,
      payment_status = v_pay_status,
      completed_at = now()
    where id = v_buy.id;

    perform pos_private.upsert_payable_for_buy(v_buy.id);

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor, 'BUY_COMPLETE', 'buy', v_buy.id,
      'Hoàn tất mua vào sau nấu ' || v_buy.buy_no,
      jsonb_build_object(
        'buy_no', v_buy.buy_no,
        'form02_no', v_buy.form02_no,
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
      'form02No', v_buy.form02_no,
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

revoke all on function public.pos_complete_buy_melt(uuid, text) from public;
grant execute on function public.pos_complete_buy_melt(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) get_buy returns attachments list
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
    'note', b.note,
    'status', b.status,
    'workflowStatus', b.workflow_status,
    'meltCommitmentNo', b.melt_commitment_no,
    'form02No', b.form02_no,
    'meltingStartedAt', b.melting_started_at,
    'attachmentPdfPath', b.attachment_pdf_path,
    'intendedPaidDong', b.intended_paid_dong
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


-- ---------------------------------------------------------------------------
-- 9) Invoice directory: show buy after agree (INVOICE_ISSUED / FORM02_READY)
-- ---------------------------------------------------------------------------
create or replace function public.pos_list_documents(
  p_document_type text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_q text := lower(nullif(trim(coalesce(p_q, '')), ''));
  v_total int;
  v_items jsonb;
begin
  perform pos_private.require_pos_user();
  if p_document_type is not null and p_document_type not in (
    'SALE_TO_CUSTOMER', 'PURCHASE_FROM_CUSTOMER', 'STOCK_RECEIPT'
  ) then
    raise exception 'Loại chứng từ không hợp lệ' using errcode = '22023';
  end if;
  if p_payment_status is not null and p_payment_status not in (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'
  ) then
    raise exception 'Trạng thái thanh toán không hợp lệ' using errcode = '22023';
  end if;

  with docs as (
    select
      i.id,
      i.invoice_no as document_no,
      'SALE_TO_CUSTOMER'::text as document_type,
      i.issued_at,
      c.name as party_name,
      c.phone as party_phone,
      s.total_dong,
      s.paid_dong,
      s.remaining_dong,
      s.payment_status,
      s.payment_method,
      s.sale_no as ref_no
    from public.pos_invoices i
    join public.pos_sales s on s.id = i.sale_id
    join public.pos_customers c on c.id = i.customer_id
    where s.status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'SALE_TO_CUSTOMER')
      and (p_from is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (i.issued_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or s.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(i.invoice_no) like '%' || v_q || '%'
        or lower(s.sale_no) like '%' || v_q || '%'
        or lower(c.name) like '%' || v_q || '%'
        or lower(c.phone) like '%' || v_q || '%'
      )

    union all

    select
      b.id,
      b.buy_no,
      'PURCHASE_FROM_CUSTOMER',
      coalesce(b.completed_at, b.created_at),
      coalesce(b.customer_name_snapshot, c.name),
      coalesce(b.customer_phone_snapshot, c.phone),
      b.total_dong,
      b.paid_dong,
      b.remaining_dong,
      b.payment_status,
      b.payment_method,
      b.buy_no
    from public.pos_buys b
    join public.pos_customers c on c.id = b.customer_id
    where (
        b.status = 'COMPLETED'
        or (
          b.status = 'PROCESSING'
          and b.workflow_status in ('INVOICE_ISSUED', 'FORM02_READY')
        )
      )
      and (p_document_type is null or p_document_type = 'PURCHASE_FROM_CUSTOMER')
      and (p_from is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(b.completed_at, b.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or b.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(b.buy_no) like '%' || v_q || '%'
        or lower(coalesce(b.customer_name_snapshot, c.name)) like '%' || v_q || '%'
        or lower(coalesce(b.customer_phone_snapshot, c.phone)) like '%' || v_q || '%'
      )

    union all

    select
      r.id,
      r.receipt_no,
      'STOCK_RECEIPT',
      coalesce(r.completed_at, r.received_at, r.created_at),
      r.supplier_name,
      null::text,
      r.total_dong,
      r.paid_dong,
      r.remaining_dong,
      r.payment_status,
      r.payment_method,
      r.receipt_no
    from public.pos_purchase_receipts r
    where r.document_status = 'COMPLETED'
      and (p_document_type is null or p_document_type = 'STOCK_RECEIPT')
      and (p_from is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
      and (p_to is null or (coalesce(r.completed_at, r.received_at, r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (
        v_q is null
        or lower(r.receipt_no) like '%' || v_q || '%'
        or lower(r.supplier_name) like '%' || v_q || '%'
      )
  ),
  counted as (
    select count(*)::int as total from docs
  ),
  paged as (
    select
      d.id,
      d.document_no as "documentNo",
      d.document_type as "documentType",
      d.issued_at as "issuedAt",
      d.party_name as "partyName",
      d.party_phone as "partyPhone",
      d.total_dong as "totalDong",
      d.paid_dong as "paidDong",
      d.remaining_dong as "remainingDong",
      d.payment_status as "paymentStatus",
      d.payment_method as "paymentMethod",
      d.ref_no as "refNo"
    from docs d
    order by d.issued_at desc
    limit v_limit offset v_offset
  )
  select
    (select total from counted),
    coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb)
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;
