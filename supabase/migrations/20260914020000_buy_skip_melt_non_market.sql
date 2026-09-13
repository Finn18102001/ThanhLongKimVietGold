-- Skip-melt: any non-market (catalog/branded) line may skip.
-- Market gold/silver must keep the melt → purity flow.

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
  v_item_count integer;
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

    select count(*)::integer into v_item_count
    from public.pos_buy_items i
    where i.buy_id = v_buy.id;

    if coalesce(v_item_count, 0) = 0 then
      raise exception 'Phiếu mua không có dòng hàng' using errcode = '22023';
    end if;

    -- Chỉ chặn vàng/bạc thị trường. SP catalog/thương hiệu được phép bỏ qua nấu.
    select count(*)::integer into v_bad
    from public.pos_buy_items i
    where i.buy_id = v_buy.id
      and coalesce(i.is_market_gold, false);

    if coalesce(v_bad, 0) > 0 then
      raise exception 'Vàng/bạc thị trường bắt buộc đi flow nấu — không bỏ qua được'
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

comment on function public.pos_buy_skip_melt(uuid, text) is
  'Skip melt/purity for buys with only non-market items. Market gold/silver must melt.';

revoke all on function public.pos_buy_skip_melt(uuid, text) from public, anon;
grant execute on function public.pos_buy_skip_melt(uuid, text) to authenticated;
