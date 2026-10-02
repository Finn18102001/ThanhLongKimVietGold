-- Recent-buy list: expose filtered row count so the purchase modal can paginate.
-- Return shape stays a jsonb array. totalCount is the match count before limit/offset.

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

  select coalesce(jsonb_agg((to_jsonb(t) - 'ord') order by t.ord), '[]'::jsonb)
  into v_rows
  from (
    select
      row_number() over (
        order by coalesce(b.completed_at, b.created_at) desc, b.id desc
      ) as ord,
      count(*) over() as "totalCount",
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
        or lower(coalesce(b.form02_no, '')) like '%' || v_q || '%'
      )
    order by coalesce(b.completed_at, b.created_at) desc, b.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;

  return v_rows;
end;
$$;

revoke all on function public.pos_list_buys(integer, integer, text, text) from public, anon;
grant execute on function public.pos_list_buys(integer, integer, text, text) to authenticated;
