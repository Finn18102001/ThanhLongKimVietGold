-- P11 hotfix: never UPDATE inside require_pos_user.
-- Root cause /invoices digest 965157535:
--   pos_list_documents → require_pos_user → reconcile_stale_work_shifts (UPDATE)
--   runs in a read-only transaction on Vercel/PostgREST → crash.
-- Reconcile stays on open/close/list/overview RPCs only (write-capable paths).

create or replace function pos_private.require_pos_user()
returns text
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_email text := public.tlkv_current_email();
begin
  if v_email = '' or not public.tlkv_has_pos_access() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform pos_private.assert_admin_otp_verified();
  perform pos_private.assert_session_fresh();
  perform pos_private.assert_work_hours_for_staff();
  return v_email;
end;
$$;
