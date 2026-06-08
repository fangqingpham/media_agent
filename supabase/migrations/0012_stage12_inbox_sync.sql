-- 0012_stage12_inbox_sync.sql
-- Stage 12: Advanced Social Inbox API (official-API comment sync).
--
-- Pulls Page-post COMMENTS via the official Graph API (using the Stage 7 Facebook
-- connection + pages_read_engagement) and syncs them into the existing
-- social_interactions inbox, then runs the Stage 4 AI classifier + reply drafter.
-- NO scraping, NO auto-reply, NO auto-like/follow/DM. Sensitive replies still
-- require human approval (enforced by the Stage 4 classifier).
--
-- New tables:
--   social_sync_jobs     — one row per sync run (per account)
--   social_sync_logs     — human-readable log lines for a job
--   imported_social_items— dedupe ledger: maps an external item id -> interaction
--   sync_error_logs      — sync failures
--
-- Reuses social_interactions (Stage 4) and social_accounts/social_tokens (Stage 7).

create table public.social_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null check (platform in ('facebook','instagram','tiktok')),
  status text not null default 'running' check (status in ('running','success','failed')),
  scanned_count int not null default 0,    -- posts scanned
  imported_count int not null default 0,   -- new interactions created
  skipped_count int not null default 0,    -- duplicates skipped
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.social_sync_jobs(owner_id);
create index on public.social_sync_jobs(account_id);

create table public.social_sync_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.social_sync_jobs(id) on delete cascade,
  level text not null default 'info' check (level in ('info','warn','error')),
  message text not null,
  created_at timestamptz not null default now()
);
create index on public.social_sync_logs(job_id);

-- Dedupe ledger. A given external item (e.g. a Facebook comment id) is imported
-- at most once per owner+platform.
create table public.imported_social_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null check (platform in ('facebook','instagram','tiktok')),
  item_type text not null default 'comment' check (item_type in ('comment','message')),
  external_id text not null,
  interaction_id uuid references public.social_interactions(id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, platform, external_id)
);
create index on public.imported_social_items(owner_id);

create table public.sync_error_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.social_sync_jobs(id) on delete set null,
  platform text,
  context text,
  error_message text,
  created_at timestamptz not null default now()
);
create index on public.sync_error_logs(owner_id);

-- RLS — owner-scoped on all four tables.
alter table public.social_sync_jobs      enable row level security;
alter table public.social_sync_logs      enable row level security;
alter table public.imported_social_items enable row level security;
alter table public.sync_error_logs        enable row level security;

create policy "owner_all_sync_jobs" on public.social_sync_jobs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_sync_logs" on public.social_sync_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_imported_items" on public.imported_social_items
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_sync_errors" on public.sync_error_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
