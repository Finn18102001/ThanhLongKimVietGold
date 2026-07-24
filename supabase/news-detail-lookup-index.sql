-- News detail lookup speed: slug + status (matches getBySlug filters + RLS).
-- Safe to re-run. Apply in Supabase → SQL Editor.

create index if not exists idx_news_slug_status
  on public.news (slug, status);

-- Related-by-category already covered by idx_news_category_published_at
-- (category_id, published_at desc) where status = 'published'.

analyze public.news;
