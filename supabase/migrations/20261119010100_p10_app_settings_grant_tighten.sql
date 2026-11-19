-- P10 Module 1 follow-up: authenticated chỉ SELECT trên pos_app_settings.
-- Ghi/đổi flag đi qua RPC security definer (pos_set_app_setting_bool).

revoke all on table public.pos_app_settings from public, anon, authenticated;
grant select on table public.pos_app_settings to authenticated;
grant select, insert, update, delete on table public.pos_app_settings to service_role;
