-- 0006_stage6_analytics.sql
-- Stage 6: Analytics + AI Improvement Engine.
-- Reads existing data (post_drafts, post_performance_basic, manual_post_logs,
-- leads) — no duplication of metrics. Two new tables only:
--   analytics_snapshots: a saved point-in-time computed metrics blob for a range
--   ai_reports: the AI weekly report + structured recommendations for a snapshot
-- (weekly_reports + ai_recommendations from the spec are merged into ai_reports,
--  since the AI returns one combined JSON object covering both.)

create table public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  label text,
  date_from date,
  date_to date,
  filters jsonb default '{}'::jsonb,
  metrics jsonb not null,          -- totals, lead funnel, per-post, breakdowns
  created_at timestamptz not null default now()
);
create index on public.analytics_snapshots(brand_id);
create index on public.analytics_snapshots(owner_id);

create table public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  snapshot_id uuid references public.analytics_snapshots(id) on delete cascade,
  model text,
  report jsonb not null,           -- full structured AI report + recommendations
  created_at timestamptz not null default now()
);
create index on public.ai_reports(snapshot_id);
create index on public.ai_reports(brand_id);

alter table public.analytics_snapshots enable row level security;
alter table public.ai_reports          enable row level security;

create policy "owner_all_snapshots" on public.analytics_snapshots
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_ai_reports" on public.ai_reports
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
