-- 1) pos_get_buy: expose createdAt for print dates (cam kết nấu before melt start)
-- 2) Shared POS counter: only nhanvienthanglongkimviet@gmail.com is is_shared
--    so pos_list_sale_operators returns all other active staff as counter operators

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

revoke all on function public.pos_get_buy(uuid) from public, anon;
grant execute on function public.pos_get_buy(uuid) to authenticated;

-- Only the shared counter login is is_shared; all other active staff appear in operator list.
update public.pos_staff
set is_shared = false,
    updated_at = now()
where coalesce(is_shared, false)
  and lower(email) <> lower('nhanvienthanglongkimviet@gmail.com');

update public.pos_staff
set is_shared = true,
    updated_at = now()
where lower(email) = lower('nhanvienthanglongkimviet@gmail.com');
