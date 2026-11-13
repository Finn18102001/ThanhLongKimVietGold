-- L-VOID-DEPOSIT: hủy HĐ Đặt cọc (DEPOSIT) đã giao phải hoàn kho như SALE / PREORDER đã giao.
-- Bug: pos_private.void_sale_invoice chỉ SALE_VOID khi SALE hoặc PREORDER+FULFILLED;
--      DEPOSIT+FULFILLED chỉ hoàn tiền, không hoàn kho.
--
-- md5 guard: production đã đọc 14/11/2026
--   pos_private.void_sale_invoice(uuid,text,text)  md5(prosrc) 4fd0e6ba3a0b1cf421d95dae2e25e8f4
-- Không đổi bảng; không cần GRANT bảng (§32.1). EXECUTE đã PUBLIC.
--
-- ROLLBACK: chạy lại def trong tlkv_backup_20261110._routines__void_deposit
--   (dòng name = 'pos_private.void_sale_invoice').
--
-- Lịch sử: 8 HĐ DEPOSIT+FULFILLED đã VOIDED trước fix (void_tx=0) — đối soát thủ công,
-- không backfill tự động trong migration này (có đơn thật giá trị lớn).

create table if not exists tlkv_backup_20261110._routines__void_deposit (
  name text not null,
  def text not null,
  md5 text not null,
  backed_at timestamptz not null default now()
);
alter table tlkv_backup_20261110._routines__void_deposit enable row level security;

do $guard$
declare
  v_oid oid := 'pos_private.void_sale_invoice(uuid, text, text)'::regprocedure;
begin
  if (select md5(prosrc) from pg_proc where oid = v_oid) <> '4fd0e6ba3a0b1cf421d95dae2e25e8f4' then
    raise exception 'DUNG: void_sale_invoice tren production da khac ban da doc (4fd0e6ba).';
  end if;

  insert into tlkv_backup_20261110._routines__void_deposit (name, def, md5)
  select 'pos_private.void_sale_invoice', pg_get_functiondef(v_oid), md5(prosrc)
  from pg_proc where oid = v_oid;
end $guard$;

create or replace function pos_private.void_sale_invoice(p_invoice_id uuid, p_reason text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$

declare
  v_actor text;
  v_cached jsonb;
  v_invoice public.pos_invoices%rowtype;
  v_sale public.pos_sales%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_item record;
  v_pay record;
  v_returned integer;
  v_restore integer;
  v_account uuid;
  v_stock_lines jsonb := '[]'::jsonb;
  v_cash_lines jsonb := '[]'::jsonb;
  v_ledger_id uuid;
  v_snapshot jsonb;
  v_items_snap jsonb;
  v_cust_name text;
  v_cust_phone text;
  v_cust_cccd text;
begin
  v_actor := pos_private.require_invoice_void_actor();
  v_cached := pos_private.begin_idempotency(p_idempotency_key, 'void_sale_invoice');
  if v_cached is not null then
    return v_cached;
  end if;

  begin
    if v_reason is null or length(v_reason) < 3 then
      raise exception 'Phải nhập lý do hủy hóa đơn (tối thiểu 3 ký tự).'
        using errcode = '22023';
    end if;

    select * into v_invoice
    from public.pos_invoices
    where id = p_invoice_id
    for update;
    if not found then
      raise exception 'Không tìm thấy hóa đơn' using errcode = 'P0002';
    end if;
    if v_invoice.status = 'VOIDED' then
      raise exception 'Hóa đơn đã được hủy trước đó.' using errcode = '22023';
    end if;
    if v_invoice.status <> 'ISSUED' then
      raise exception 'Chỉ hủy được hóa đơn đang phát hành.' using errcode = '22023';
    end if;

    select * into v_sale
    from public.pos_sales
    where id = v_invoice.sale_id
    for update;
    if not found then
      raise exception 'Không tìm thấy giao dịch bán gắn hóa đơn' using errcode = 'P0002';
    end if;
    if v_sale.status = 'VOIDED' then
      raise exception 'Giao dịch bán đã hủy.' using errcode = '22023';
    end if;
    if v_sale.status <> 'COMPLETED' then
      raise exception 'Chỉ hủy được giao dịch đã hoàn tất.' using errcode = '22023';
    end if;

    select c.name, c.phone, c.citizen_id
    into v_cust_name, v_cust_phone, v_cust_cccd
    from public.pos_customers c
    where c.id = v_sale.customer_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'product_name', si.product_name_snapshot,
      'sku', si.sku_snapshot,
      'quantity', si.quantity,
      'weight_chi', si.weight_chi,
      'unit_price_dong', si.unit_price_dong,
      'total_dong', si.total_price_dong
    ) order by si.id), '[]'::jsonb)
    into v_items_snap
    from public.pos_sale_items si
    where si.sale_id = v_sale.id;

    v_snapshot := jsonb_build_object(
      'kind', 'sale_void',
      'invoice_no', v_invoice.invoice_no,
      'customer_name', v_cust_name,
      'customer_citizen_id', v_cust_cccd,
      'customer_phone', v_cust_phone,
      'payment_method', v_sale.payment_method,
      'paid_dong', v_sale.paid_dong,
      'remaining_dong', v_sale.remaining_dong,
      'total_dong', v_sale.total_dong,
      'items', v_items_snap
    );

    -- SALE luôn hoàn kho; PREORDER/DEPOSIT chỉ hoàn kho khi đã giao (đã xuất kho).
    if v_sale.transaction_type = 'SALE'
       or (v_sale.transaction_type in ('PREORDER', 'DEPOSIT')
           and v_sale.fulfillment_status = 'FULFILLED') then
      for v_item in
        select
          si.sku_id,
          sum(si.quantity)::integer as quantity,
          max(si.sku_snapshot) as sku_snapshot,
          max(si.product_name_snapshot) as product_name_snapshot
        from public.pos_sale_items si
        where si.sale_id = v_sale.id
        group by si.sku_id
      loop
        select coalesce(sum(ri.quantity), 0)::integer into v_returned
        from public.pos_return_items ri
        join public.pos_returns r on r.id = ri.return_id
        where r.sale_id = v_sale.id
          and ri.sku_id = v_item.sku_id
          and r.status = 'COMPLETED';

        v_restore := greatest(v_item.quantity - coalesce(v_returned, 0), 0);
        if v_restore > 0 then
          perform pos_private.apply_stock_change(
            v_item.sku_id,
            v_restore,
            'SALE_VOID',
            format(
              'Hủy HĐ %s — hoàn kho %s × %s. Lý do: %s',
              v_invoice.invoice_no,
              v_restore,
              coalesce(v_item.product_name_snapshot, v_item.sku_snapshot, 'SP'),
              v_reason
            ),
            'INVOICE_VOID',
            v_invoice.id,
            v_actor,
            null,
            null
          );
          v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
            'sku_id', v_item.sku_id,
            'qty', v_restore,
            'name', v_item.product_name_snapshot
          ));
        end if;
      end loop;
    end if;

    for v_pay in
      select p.*
      from public.pos_sale_payments p
      where p.sale_id = v_sale.id
      order by p.paid_at, p.id
    loop
      if coalesce(v_pay.amount_dong, 0) <= 0 then
        continue;
      end if;
      v_account := pos_private.cash_account_for_method(v_pay.payment_method);
      v_ledger_id := pos_private.cash_post_allow_negative(
        v_account,
        'SALE_VOID_REFUND',
        'OUT',
        v_pay.amount_dong,
        format(
          'Hủy HĐ %s — hoàn tiền thu %s (%s). Lý do: %s',
          v_invoice.invoice_no,
          to_char(v_pay.amount_dong, 'FM999,999,999,999'),
          v_pay.payment_method,
          v_reason
        ),
        v_actor,
        now(),
        'INVOICE_VOID',
        v_invoice.id,
        v_invoice.invoice_no,
        'pos_invoice_void_payment',
        v_pay.id
      );
      v_cash_lines := v_cash_lines || jsonb_build_array(jsonb_build_object(
        'payment_id', v_pay.id,
        'amount_dong', v_pay.amount_dong,
        'ledger_id', v_ledger_id,
        'method', v_pay.payment_method
      ));
    end loop;

    update public.pos_invoices
    set
      status = 'VOIDED',
      voided_at = now(),
      voided_by = v_actor,
      void_reason = v_reason
    where id = v_invoice.id;

    update public.pos_sales
    set
      status = 'VOIDED',
      voided_at = now(),
      voided_by = v_actor,
      void_reason = v_reason,
      paid_dong = paid_dong,
      remaining_dong = 0,
      payment_status = 'PAID'
    where id = v_sale.id;

    update public.pos_receivables
    set
      paid_dong = total_dong,
      remaining_dong = 0,
      status = 'CLOSED',
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
    where sale_id = v_sale.id;

    if v_sale.transaction_type = 'PREORDER'
       and v_sale.fulfillment_status in ('UNFULFILLED', 'READY') then
      update public.pos_sales
      set fulfillment_status = 'CANCELLED'
      where id = v_sale.id;
    end if;

    insert into public.pos_audit_log(actor_email, action, entity_type, entity_id, reason, payload)
    values (
      v_actor,
      'INVOICE_VOID',
      'invoice',
      v_invoice.id,
      v_reason,
      jsonb_build_object(
        'invoice_no', v_invoice.invoice_no,
        'sale_id', v_sale.id,
        'sale_no', v_sale.sale_no,
        'total_dong', v_invoice.total_dong,
        'paid_dong', v_sale.paid_dong,
        'transaction_type', v_sale.transaction_type,
        'fulfillment_status', v_sale.fulfillment_status,
        'stock_restored', v_stock_lines,
        'cash_refunded', v_cash_lines,
        'snapshot', v_snapshot
      )
    );

    return pos_private.finish_idempotency(
      p_idempotency_key,
      jsonb_build_object(
        'ok', true,
        'invoice_id', v_invoice.id,
        'invoice_no', v_invoice.invoice_no,
        'sale_id', v_sale.id,
        'status', 'VOIDED',
        'stock_restored', v_stock_lines,
        'cash_refunded', v_cash_lines
      )
    );
  exception when others then
    perform pos_private.clear_pending_idempotency(p_idempotency_key);
    raise;
  end;
end;
$function$;

-- Verify patch landed (condition includes DEPOSIT).
do $verify$
declare
  v_src text;
begin
  select prosrc into v_src
  from pg_proc
  where oid = 'pos_private.void_sale_invoice(uuid, text, text)'::regprocedure;
  if position('transaction_type in (''PREORDER'', ''DEPOSIT'')' in v_src) = 0 then
    raise exception 'DUNG: patch DEPOSIT restock khong co trong void_sale_invoice.';
  end if;
end $verify$;
