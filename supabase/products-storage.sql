-- ============================================================================
-- TLKV Product Catalog — Supabase Storage (Step 4)
-- Bucket: product-media (public read, admin write)
--
-- Layout:
--   product-media/
--     brands/<brand-slug>/logo/<uuid>.<ext>
--     products/<product-id>/thumbnail/<uuid>.<ext>
--     products/<product-id>/main/<uuid>.<ext>
--     products/<product-id>/gallery/<uuid>.<ext>
--
-- Naming: <uuid>-<sanitized-filename>.<ext>
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  8 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read product-media" on storage.objects;
create policy "Public read product-media"
  on storage.objects for select to public
  using (bucket_id = 'product-media');

drop policy if exists "Admin write product-media (insert)" on storage.objects;
create policy "Admin write product-media (insert)"
  on storage.objects for insert to public
  with check (
    bucket_id = 'product-media'
    and (auth.jwt() ->> 'email') = 'tuananh18101@gmail.com'
  );

drop policy if exists "Admin write product-media (update)" on storage.objects;
create policy "Admin write product-media (update)"
  on storage.objects for update to public
  using (
    bucket_id = 'product-media'
    and (auth.jwt() ->> 'email') = 'tuananh18101@gmail.com'
  )
  with check (
    bucket_id = 'product-media'
    and (auth.jwt() ->> 'email') = 'tuananh18101@gmail.com'
  );

drop policy if exists "Admin write product-media (delete)" on storage.objects;
create policy "Admin write product-media (delete)"
  on storage.objects for delete to public
  using (
    bucket_id = 'product-media'
    and (auth.jwt() ->> 'email') = 'tuananh18101@gmail.com'
  );
