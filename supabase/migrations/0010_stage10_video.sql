-- 0010_stage10_video.sql
-- Stage 10: AI Video Production Assistant.
--
-- Generates structured short-form video "kits" (script, scenes, b-roll, overlays,
-- editing notes, and an AI-video-generation prompt) and batch recording plans.
-- NOTHING is auto-posted and NO video-generation API is called — the kit only
-- produces text + prompts a human takes into Canva/CapCut/Veo/Kling/etc.
--
-- New tables:
--   video_kits             — one generated kit (optionally tied to a post_draft)
--   video_scenes           — the scene-by-scene shot list (rows belong to a kit)
--   batch_recording_plans  — a plan to film several posts in one session
--   video_production_notes — free-form notes on a kit or post
--
-- Reuses post_drafts (a kit can attach to a draft via post_id), brands,
-- content_pillars, and the active brand_briefs "Brand Brain".

create table public.video_kits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  post_id uuid references public.post_drafts(id) on delete set null,   -- attached draft/post
  pillar_id uuid references public.content_pillars(id) on delete set null,

  platform text not null check (platform in ('facebook','instagram','tiktok')),
  duration_seconds int not null default 30 check (duration_seconds in (15,30,45)),

  title text,
  hook text,
  hook_variations jsonb,          -- string[]
  voiceover text,
  on_screen_text jsonb,           -- string[] or [{timestamp,text}]
  broll_suggestions jsonb,        -- string[]
  filming_notes text,
  thumbnail_text text,
  editing_notes text,             -- Canva / CapCut instructions
  ai_video_prompt text,           -- prompt for Veo / Kling / Runway / Canva
  caption text,
  hashtags text[] default '{}',
  cta text,

  compliance_risk text not null default 'low' check (compliance_risk in ('low','medium','high')),
  compliance_reason text,
  human_approval_required boolean not null default false,

  topic text,                     -- the brief/instruction used
  model text,
  raw_response jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_video_kits_updated before update on public.video_kits
  for each row execute function public.set_updated_at();

create index on public.video_kits(owner_id);
create index on public.video_kits(brand_id);
create index on public.video_kits(post_id);

-- Scene-by-scene shot list (one row per scene, ordered).
create table public.video_scenes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kit_id uuid not null references public.video_kits(id) on delete cascade,
  scene_number int not null,
  timestamp_label text,           -- e.g. "0:00-0:03"
  shot_description text,
  voiceover text,
  on_screen text,
  created_at timestamptz not null default now()
);
create index on public.video_scenes(kit_id);

-- Batch recording plan across several posts.
create table public.batch_recording_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text,
  post_ids uuid[] default '{}',   -- the selected post_drafts
  groups jsonb,                   -- [{ group_name, group_by, posts:[], shots:[] }]
  shot_checklist jsonb,           -- string[]
  estimated_minutes int,
  model text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_batch_plans_updated before update on public.batch_recording_plans
  for each row execute function public.set_updated_at();

create index on public.batch_recording_plans(owner_id);
create index on public.batch_recording_plans(brand_id);

-- Free-form production notes (on a kit and/or a post).
create table public.video_production_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kit_id uuid references public.video_kits(id) on delete cascade,
  post_id uuid references public.post_drafts(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);
create index on public.video_production_notes(kit_id);

-- RLS — owner-scoped on all four tables.
alter table public.video_kits             enable row level security;
alter table public.video_scenes           enable row level security;
alter table public.batch_recording_plans  enable row level security;
alter table public.video_production_notes enable row level security;

create policy "owner_all_video_kits" on public.video_kits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_video_scenes" on public.video_scenes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_batch_plans" on public.batch_recording_plans
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_video_notes" on public.video_production_notes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
