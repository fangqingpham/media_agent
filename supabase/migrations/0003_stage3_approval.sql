-- 0003_stage3_approval.sql
-- Stage 3: Approval Queue + Manual Posting Workflow
-- Reuses post_drafts as the single source of truth. Adds: two new statuses,
-- an admin_notes column, and three supporting tables (status history, manual
-- post logs, basic performance). No "approval_queue" table — the queue is just
-- a filtered view of post_drafts (status in pending_approval/needs_revision/
-- approved/rejected).

-- 1. Expand the status CHECK to allow the new workflow statuses.
alter table public.post_drafts drop constraint if exists post_drafts_status_check;
alter table public.post_drafts add constraint post_drafts_status_check
  check (status in (
    'idea','draft','pending_approval','approved','ready_to_post',
    'scheduled','scheduled_manually','posted','rejected','needs_revision'
  ));

-- 2. Admin notes on the post itself.
alter table public.post_drafts add column if not exists admin_notes text;

-- 3. Status history — one row per transition.
create table public.approval_status_history (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.post_drafts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.approval_status_history(post_id);

-- 4. Manual post log — one per post (unique post_id prevents duplicates).
create table public.manual_post_logs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.post_drafts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  scheduled_at timestamptz,
  posted_at timestamptz,
  post_url text,
  final_caption text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_manual_post_logs_updated before update on public.manual_post_logs
  for each row execute function public.set_updated_at();

-- 5. Basic performance — one per post (full analytics is Stage 6).
create table public.post_performance_basic (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.post_drafts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  views int default 0,
  likes int default 0,
  comments int default 0,
  shares int default 0,
  saves int default 0,
  dms int default 0,
  leads int default 0,
  notes text,
  updated_at timestamptz not null default now()
);
create trigger trg_post_performance_updated before update on public.post_performance_basic
  for each row execute function public.set_updated_at();

-- 6. RLS — owner-scoped on all three new tables.
alter table public.approval_status_history enable row level security;
alter table public.manual_post_logs        enable row level security;
alter table public.post_performance_basic  enable row level security;

create policy "owner_all_history" on public.approval_status_history
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_manual_logs" on public.manual_post_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_performance" on public.post_performance_basic
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
