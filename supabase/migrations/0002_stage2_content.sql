-- 0002_stage2_content.sql
-- Stage 2: AI Content Calendar + Post Generator
-- Design note: instead of spreading content across five tables
-- (content_calendar / post_drafts / post_variations / hashtags / video_scripts),
-- everything lives in ONE table `post_drafts`. The calendar is just a query over
-- it (filter by scheduled_for + status), hashtags are a text[] column, and the
-- video script / carousel outline are jsonb columns. This keeps Stage 2 simple
-- and avoids join overhead. Variation history is a documented TODO for later.

create table public.post_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  brief_id uuid references public.brand_briefs(id) on delete set null,   -- brain version used
  pillar_id uuid references public.content_pillars(id) on delete set null,
  audience_id uuid references public.target_audiences(id) on delete set null,

  platform text not null check (platform in ('facebook','instagram','tiktok')),
  content_type text not null,
  status text not null default 'draft' check (status in
    ('idea','draft','pending_approval','approved','scheduled','posted','rejected','needs_revision')),
  scheduled_for date,

  -- generated content
  title text,
  hook text,
  caption text,
  platform_caption text,
  cta text,
  visual_idea text,
  hashtags text[] default '{}',
  video_script jsonb,        -- { duration_seconds, scenes:[{timestamp, voiceover, on_screen}] }
  carousel_outline jsonb,    -- [{ slide, headline, body }]

  -- compliance
  compliance_risk text not null default 'low' check (compliance_risk in ('low','medium','high')),
  compliance_reason text,
  human_approval_required boolean not null default false,
  claims_to_check text[] default '{}',

  -- generation metadata
  tone text,
  user_instruction text,
  model text,
  raw_response jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reuse the Stage 1 trigger function set_updated_at()
create trigger trg_post_drafts_updated before update on public.post_drafts
  for each row execute function public.set_updated_at();

create index on public.post_drafts(brand_id);
create index on public.post_drafts(owner_id);
create index on public.post_drafts(status);
create index on public.post_drafts(platform);
create index on public.post_drafts(pillar_id);
create index on public.post_drafts(scheduled_for);

-- RLS: owner-scoped
alter table public.post_drafts enable row level security;

create policy "owner_all_post_drafts" on public.post_drafts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
