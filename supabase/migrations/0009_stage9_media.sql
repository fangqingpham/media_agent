-- 0009_stage9_media.sql
-- Stage 9: Media Asset Library.
--
-- New tables: media_assets, post_media_assets (junction), media_usage_logs.
-- Consistent with earlier stages, tags are a text[] column on media_assets
-- rather than a separate media_asset_tags table (same consolidation choice made
-- for hashtags in Stage 2 and keyword tags in Stage 8 — avoids join overhead for
-- a simple list). Also adds a `media_suggestion` jsonb column to post_drafts so
-- the generator's AI media suggestions (Stage 9 item 5) have somewhere to live.
--
-- Files themselves live in Supabase STORAGE (bucket "media"); only the resulting
-- URL + storage path are stored here. External assets (Canva / CapCut / stock)
-- need no storage at all — just a URL. See storage setup notes in the summary.

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  pillar_id uuid references public.content_pillars(id) on delete set null,

  title text not null,
  asset_type text not null default 'image' check (asset_type in
    ('image','video','thumbnail','logo','template','b-roll','carousel','other')),
  platforms text[] default '{}',          -- suitability: facebook/instagram/tiktok
  tags text[] default '{}',

  source text not null default 'upload' check (source in ('upload','external','stock')),
  file_url text,                           -- uploaded public URL OR stock URL
  storage_path text,                       -- path in the "media" bucket (uploads only)
  external_edit_link text,                 -- Canva / CapCut edit link
  thumbnail_url text,
  file_kind text check (file_kind in ('image','video')),
  mime_type text,

  notes text,
  last_used_date timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_media_assets_updated before update on public.media_assets
  for each row execute function public.set_updated_at();

create index on public.media_assets(owner_id);
create index on public.media_assets(brand_id);
create index on public.media_assets(asset_type);

-- Which media is attached to which post (many-to-many).
create table public.post_media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.post_drafts(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, media_id)
);
create index on public.post_media_assets(post_id);
create index on public.post_media_assets(media_id);

-- Usage history — one row each time an asset is attached to a post.
create table public.media_usage_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  post_id uuid references public.post_drafts(id) on delete set null,
  platform text,
  used_at timestamptz not null default now(),
  note text
);
create index on public.media_usage_logs(media_id);
create index on public.media_usage_logs(post_id);

-- AI media suggestion from the generator (Stage 9 item 5).
alter table public.post_drafts
  add column if not exists media_suggestion jsonb;
  -- shape: { needed_type, could_use_existing, suggested_thumbnail_text, suggested_overlay_text }

-- RLS — owner-scoped on all three new tables.
alter table public.media_assets      enable row level security;
alter table public.post_media_assets enable row level security;
alter table public.media_usage_logs  enable row level security;

create policy "owner_all_media_assets" on public.media_assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_post_media" on public.post_media_assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_media_usage" on public.media_usage_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
