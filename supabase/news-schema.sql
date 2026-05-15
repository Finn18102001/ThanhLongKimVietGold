-- ============================================================================
-- TLKV News CMS — Database Schema
-- Paste this file into Supabase → SQL Editor → RUN.
-- Idempotent: safe to re-run (drops & recreates policies, uses IF NOT EXISTS).
--
-- Contents:
--   1) extensions
--   2) helper functions (slugify + updated_at trigger)
--   3) tables (news_categories, news_tags, news, news_tag_relations, news_change_log)
--   4) indexes
--   5) triggers
--   6) RLS policies (public read for published; admin email full access)
--   7) seed data (one default category)
-- ----------------------------------------------------------------------------
-- IMPORTANT:
--   Replace 'tuananh18101@gmail.com' with your admin email (must match the
--   email used by other RLS policies in this project — see rls-admin-email.sql).
-- ============================================================================

-- 1) extensions ---------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "unaccent";
create extension if not exists "pg_trgm";

-- 2) helper functions ---------------------------------------------------------

-- Strip Vietnamese diacritics + lowercase + replace non-alnum with '-'.
create or replace function public.tlkv_slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
           regexp_replace(
             lower(public.unaccent(coalesce(input, ''))),
             '[^a-z0-9]+', '-', 'g'
           )
         );
$$;

-- Generic updated_at trigger reused by all tables that have an updated_at col.
create or replace function public.tlkv_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-set published_at when status flips draft → published (only if null).
create or replace function public.tlkv_news_touch_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published'
     and (old.status is distinct from 'published')
     and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

-- 3) tables -------------------------------------------------------------------

create table if not exists public.news_categories (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  slug         text not null unique,
  description  text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.news_tags (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.news (
  id                 uuid primary key default uuid_generate_v4(),
  title              text not null,
  slug               text not null unique,
  short_description  text,
  thumbnail_url      text,   -- cover / OG hero (single URL)
  -- Editor.js JSON: { time, blocks: [...], version }
  -- Inline images live in blocks, e.g. { "type": "image", "data": { "file": { "url": "…/content/…" } } }
  -- Files upload to Storage bucket news-media/content/ (no extra column needed).
  content            jsonb not null default jsonb_build_object('blocks', '[]'::jsonb),
  category_id        uuid references public.news_categories(id) on delete set null,
  status             text not null default 'draft'
                       check (status in ('draft', 'published', 'archived')),
  featured           boolean not null default false,
  view_count         bigint  not null default 0,

  seo_title          text,
  seo_description    text,
  seo_keywords       text,

  author_email       text,        -- snapshot of editor email at write-time

  published_at       timestamptz, -- null = not yet published
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.news_tag_relations (
  news_id  uuid not null references public.news(id)      on delete cascade,
  tag_id   uuid not null references public.news_tags(id) on delete cascade,
  primary key (news_id, tag_id)
);

-- Optional but recommended: per-write audit log (parallel to product_change_log).
create table if not exists public.news_change_log (
  id           bigserial primary key,
  action       text not null,            -- news_insert | news_update | news_delete | news_publish | news_unpublish
  entity_name  text not null,            -- usually the article title
  entity_id    text,                     -- news.id as text
  summary      text,                     -- short human-readable description
  payload      jsonb,                    -- { before, after, ... }
  actor_email  text,                     -- auth.jwt()->>'email'
  created_at   timestamptz not null default now()
);

-- 4) indexes ------------------------------------------------------------------

create index if not exists idx_news_status_published_at
  on public.news (status, published_at desc nulls last);

create index if not exists idx_news_featured_published_at
  on public.news (featured, published_at desc nulls last)
  where status = 'published';

create index if not exists idx_news_category_published_at
  on public.news (category_id, published_at desc nulls last)
  where status = 'published';

create index if not exists idx_news_slug
  on public.news (slug);

-- Trigram index for title search (ILIKE %q%).
create index if not exists idx_news_title_trgm
  on public.news using gin (title public.gin_trgm_ops);

create index if not exists idx_news_short_desc_trgm
  on public.news using gin (short_description public.gin_trgm_ops);

create index if not exists idx_news_change_log_created_at
  on public.news_change_log (created_at desc);

create index if not exists idx_news_change_log_entity_name_trgm
  on public.news_change_log using gin (entity_name public.gin_trgm_ops);

-- 5) triggers -----------------------------------------------------------------

drop trigger if exists trg_news_categories_updated_at on public.news_categories;
create trigger trg_news_categories_updated_at
  before update on public.news_categories
  for each row execute function public.tlkv_set_updated_at();

drop trigger if exists trg_news_updated_at on public.news;
create trigger trg_news_updated_at
  before update on public.news
  for each row execute function public.tlkv_set_updated_at();

drop trigger if exists trg_news_touch_published_at on public.news;
create trigger trg_news_touch_published_at
  before update on public.news
  for each row execute function public.tlkv_news_touch_published_at();

-- On INSERT, if status=published and published_at null → set published_at.
create or replace function public.tlkv_news_insert_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_news_insert_published_at on public.news;
create trigger trg_news_insert_published_at
  before insert on public.news
  for each row execute function public.tlkv_news_insert_published_at();

-- 6) RLS ----------------------------------------------------------------------

alter table public.news_categories     enable row level security;
alter table public.news_tags           enable row level security;
alter table public.news                enable row level security;
alter table public.news_tag_relations  enable row level security;
alter table public.news_change_log     enable row level security;

-- Categories: read public; write admin only.
drop policy if exists "Public read news_categories" on public.news_categories;
create policy "Public read news_categories"
  on public.news_categories for select to public using (true);

drop policy if exists "Admin write news_categories" on public.news_categories;
create policy "Admin write news_categories"
  on public.news_categories for all to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- Tags: read public; write admin only.
drop policy if exists "Public read news_tags" on public.news_tags;
create policy "Public read news_tags"
  on public.news_tags for select to public using (true);

drop policy if exists "Admin write news_tags" on public.news_tags;
create policy "Admin write news_tags"
  on public.news_tags for all to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- News: anon can SELECT only published rows. Admin sees & writes everything.
drop policy if exists "Public read news (published)" on public.news;
create policy "Public read news (published)"
  on public.news for select to public
  using (status = 'published');

drop policy if exists "Admin read news (all)" on public.news;
create policy "Admin read news (all)"
  on public.news for select to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

drop policy if exists "Admin insert news" on public.news;
create policy "Admin insert news"
  on public.news for insert to public
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

drop policy if exists "Admin update news" on public.news;
create policy "Admin update news"
  on public.news for update to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

drop policy if exists "Admin delete news" on public.news;
create policy "Admin delete news"
  on public.news for delete to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- Tag relations: read public (anyone), write admin only.
drop policy if exists "Public read news_tag_relations" on public.news_tag_relations;
create policy "Public read news_tag_relations"
  on public.news_tag_relations for select to public using (true);

drop policy if exists "Admin write news_tag_relations" on public.news_tag_relations;
create policy "Admin write news_tag_relations"
  on public.news_tag_relations for all to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- Change log: admin only.
drop policy if exists "Admin read news_change_log" on public.news_change_log;
create policy "Admin read news_change_log"
  on public.news_change_log for select to public
  using ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

drop policy if exists "Admin insert news_change_log" on public.news_change_log;
create policy "Admin insert news_change_log"
  on public.news_change_log for insert to public
  with check ((auth.jwt() ->> 'email') = 'tuananh18101@gmail.com');

-- 7) Public RPC: increment view counter atomically (anon-callable). -----------
-- Defined as SECURITY DEFINER so anon can update view_count without UPDATE RLS.
create or replace function public.tlkv_news_increment_view(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.news
     set view_count = view_count + 1
   where slug = p_slug
     and status = 'published';
end;
$$;

revoke all on function public.tlkv_news_increment_view(text) from public;
grant execute on function public.tlkv_news_increment_view(text) to anon, authenticated;

-- 8) seed --------------------------------------------------------------------

insert into public.news_categories (name, slug, sort_order)
values
  ('Tin tức thị trường', 'tin-tuc-thi-truong', 1),
  ('Ưu đãi',             'uu-dai',             2),
  ('Tin tức',            'tin-tuc',            3)
on conflict (slug) do nothing;

-- ============================================================================
-- DONE. To verify:
--   select count(*) from public.news;
--   select * from public.news_categories;
-- Then run supabase/news-storage.sql to create the storage bucket + policies.
-- ============================================================================
