-- ============================================================================
-- TLKV News CMS — Supabase Storage
-- Paste in Supabase → SQL Editor → RUN.
--
-- Bucket layout (single public bucket, two top-level folders):
--   news-media/
--     thumbnails/<YYYY>/<MM>/<uuid>.<ext>   ← article cover
--     content/<YYYY>/<MM>/<uuid>.<ext>      ← inline images / media
--
-- Naming convention: <uuid>-<sanitized-original-name>.<ext>
-- This guarantees uniqueness while preserving a hint of the source filename
-- for debugging in the dashboard.
--
-- Public: anyone can READ (so <img src> works without signed URLs).
-- Write/Update/Delete: restricted to admin email (parity with rls-admin-email.sql).
-- ============================================================================

-- 1) Create bucket (public). Bucket creation is idempotent via on conflict.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'news-media',
  'news-media',
  true,                          -- public read
  10 * 1024 * 1024,              -- 10 MB hard cap (server-side check)
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]::text[]
)
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- 2) RLS on storage.objects.
-- Supabase ships RLS enabled on storage.objects by default; we just (re)create policies.

-- Public READ (matches bucket.public=true but we make it explicit).
drop policy if exists "Public read news-media" on storage.objects;
create policy "Public read news-media"
  on storage.objects for select to public
  using (bucket_id = 'news-media');

-- Admin INSERT / UPDATE / DELETE.
drop policy if exists "Admin write news-media (insert)" on storage.objects;
create policy "Admin write news-media (insert)"
  on storage.objects for insert to public
  with check (
    bucket_id = 'news-media'
    and (auth.jwt() ->> 'email') = 'tuananh18101@gmail.com'
  );

drop policy if exists "Admin write news-media (update)" on storage.objects;
create policy "Admin write news-media (update)"
  on storage.objects for update to public
  using (
    bucket_id = 'news-media'
    and (auth.jwt() ->> 'email') = 'tuananh18101@gmail.com'
  )
  with check (
    bucket_id = 'news-media'
    and (auth.jwt() ->> 'email') = 'tuananh18101@gmail.com'
  );

drop policy if exists "Admin write news-media (delete)" on storage.objects;
create policy "Admin write news-media (delete)"
  on storage.objects for delete to public
  using (
    bucket_id = 'news-media'
    and (auth.jwt() ->> 'email') = 'tuananh18101@gmail.com'
  );

-- ============================================================================
-- DONE.
-- Upload check: in Supabase Dashboard → Storage → news-media → New folder
-- "thumbnails" then "content", then drag an image to verify policies.
-- ============================================================================
