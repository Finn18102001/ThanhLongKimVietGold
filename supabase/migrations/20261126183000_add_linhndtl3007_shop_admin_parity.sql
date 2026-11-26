-- Shop admin parity: linhndtl3007@gmail.com = same main-admin rights as
-- tuananh18101@gmail.com + thanglongkimviet@gmail.com
-- (bootstrap list, void actor, gold/news/storage RLS).
-- No new tables → §32.1 N/A.

-- Snapshot function defs before replace (00-BACKUP-ROLLBACK §3)
create table if not exists tlkv_backup_20261110._routines__gd_linh_admin_20261126 (
  schema_name text not null,
  proname text not null,
  definition text not null,
  snapped_at timestamptz not null default timezone('utc', now()),
  primary key (schema_name, proname)
);

insert into tlkv_backup_20261110._routines__gd_linh_admin_20261126 (schema_name, proname, definition)
values
  (
    'public',
    'tlkv_admin_emails',
    pg_get_functiondef('public.tlkv_admin_emails'::regproc)
  ),
  (
    'pos_private',
    'require_invoice_void_actor',
    pg_get_functiondef('pos_private.require_invoice_void_actor'::regproc)
  ),
  (
    'pos_private',
    'otp_admin_allowlist',
    pg_get_functiondef('pos_private.otp_admin_allowlist'::regproc)
  )
on conflict (schema_name, proname) do update
set definition = excluded.definition,
    snapped_at = excluded.snapped_at;

-- 1) Bootstrap admin emails
create or replace function public.tlkv_admin_emails()
returns text[]
language sql
immutable
as $$
  select array[
    'tuananh18101@gmail.com',
    'thanglongkimviet@gmail.com',
    'linhndtl3007@gmail.com'
  ]::text[];
$$;

-- 2) Void / reverse purchase actor allow-list (same 3 shop admins)
create or replace function pos_private.require_invoice_void_actor()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(public.tlkv_current_email(), '')));
begin
  if v_email not in (
    'thanglongkimviet@gmail.com',
    'tuananh18101@gmail.com',
    'linhndtl3007@gmail.com'
  ) then
    raise exception
      'Chỉ tài khoản admin chính cửa hàng được hủy hóa đơn.'
      using errcode = '42501';
  end if;
  return v_email;
end;
$$;

-- 3) Keep OTP allowlist array in sync (otp_email_requires_step2 already uses ADMIN role)
create or replace function pos_private.otp_admin_allowlist()
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select array[
    'tuananh18101@gmail.com',
    'thanglongkimviet@gmail.com',
    'linhndtl3007@gmail.com'
  ]::text[];
$$;

-- 4) Website / catalog write RLS: hard-coded 2 emails → tlkv_is_admin()
--    (linh already ADMIN in pos_staff, so this grants gold/news/storage parity)

-- gold_meta
drop policy if exists "admin_write_gold_meta" on public.gold_meta;
drop policy if exists "admin_update_gold_meta" on public.gold_meta;
drop policy if exists "admin_delete_gold_meta" on public.gold_meta;
create policy "admin_write_gold_meta"
  on public.gold_meta for insert to authenticated
  with check (public.tlkv_is_admin());
create policy "admin_update_gold_meta"
  on public.gold_meta for update to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());
create policy "admin_delete_gold_meta"
  on public.gold_meta for delete to authenticated
  using (public.tlkv_is_admin());

-- gold_price_rows
drop policy if exists "admin_write_gold_price_rows" on public.gold_price_rows;
drop policy if exists "admin_update_gold_price_rows" on public.gold_price_rows;
drop policy if exists "admin_delete_gold_price_rows" on public.gold_price_rows;
create policy "admin_write_gold_price_rows"
  on public.gold_price_rows for insert to authenticated
  with check (public.tlkv_is_admin());
create policy "admin_update_gold_price_rows"
  on public.gold_price_rows for update to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());
create policy "admin_delete_gold_price_rows"
  on public.gold_price_rows for delete to authenticated
  using (public.tlkv_is_admin());

-- news
drop policy if exists "Admin insert news" on public.news;
drop policy if exists "Admin update news" on public.news;
drop policy if exists "Admin delete news" on public.news;
drop policy if exists "Admin read news (all)" on public.news;
create policy "Admin insert news"
  on public.news for insert to authenticated
  with check (public.tlkv_is_admin());
create policy "Admin update news"
  on public.news for update to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());
create policy "Admin delete news"
  on public.news for delete to authenticated
  using (public.tlkv_is_admin());
create policy "Admin read news (all)"
  on public.news for select to authenticated
  using (public.tlkv_is_admin());

-- news_categories / news_tags / news_tag_relations / news_change_log
drop policy if exists "Admin write news_categories" on public.news_categories;
create policy "Admin write news_categories"
  on public.news_categories for all to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());

drop policy if exists "Admin write news_tags" on public.news_tags;
create policy "Admin write news_tags"
  on public.news_tags for all to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());

drop policy if exists "Admin write news_tag_relations" on public.news_tag_relations;
create policy "Admin write news_tag_relations"
  on public.news_tag_relations for all to authenticated
  using (public.tlkv_is_admin())
  with check (public.tlkv_is_admin());

drop policy if exists "Admin insert news_change_log" on public.news_change_log;
drop policy if exists "Admin read news_change_log" on public.news_change_log;
create policy "Admin insert news_change_log"
  on public.news_change_log for insert to authenticated
  with check (public.tlkv_is_admin());
create policy "Admin read news_change_log"
  on public.news_change_log for select to authenticated
  using (public.tlkv_is_admin());

-- storage: news-media + product-media + product-images delete
drop policy if exists "Admin write news-media (insert)" on storage.objects;
drop policy if exists "Admin write news-media (update)" on storage.objects;
drop policy if exists "Admin write news-media (delete)" on storage.objects;
create policy "Admin write news-media (insert)"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'news-media' and public.tlkv_is_admin());
create policy "Admin write news-media (update)"
  on storage.objects for update to authenticated
  using (bucket_id = 'news-media' and public.tlkv_is_admin())
  with check (bucket_id = 'news-media' and public.tlkv_is_admin());
create policy "Admin write news-media (delete)"
  on storage.objects for delete to authenticated
  using (bucket_id = 'news-media' and public.tlkv_is_admin());

drop policy if exists "Admin write product-media (insert)" on storage.objects;
drop policy if exists "Admin write product-media (update)" on storage.objects;
drop policy if exists "Admin write product-media (delete)" on storage.objects;
create policy "Admin write product-media (insert)"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-media' and public.tlkv_is_admin());
create policy "Admin write product-media (update)"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-media' and public.tlkv_is_admin())
  with check (bucket_id = 'product-media' and public.tlkv_is_admin());
create policy "Admin write product-media (delete)"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-media' and public.tlkv_is_admin());

drop policy if exists "admin_delete_product_images" on storage.objects;
create policy "admin_delete_product_images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.tlkv_is_admin());
