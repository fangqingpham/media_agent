-- 0013_stage13_team.sql
-- Stage 13: Team / Agent Access.
--
-- Adds the role/permission framework, team membership, lead assignment, and an
-- audit log. Roles: owner, admin, manager, agent, viewer.
--
-- IMPORTANT ARCHITECTURE NOTE: Stages 1-12 scope every row to a single owner
-- (owner_id = auth.uid()). This migration adds the team FRAMEWORK and enforces
-- permissions at the application layer (lib/permissions + service guards). Full
-- multi-tenant data sharing (an agent reading the OWNER's leads through RLS)
-- requires an "effective workspace owner" retrofit across the legacy tables; that
-- is intentionally left as a documented TODO rather than silently half-done.

-- Lightweight profile per auth user (display name + email cache).
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_user_profiles_updated before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- Team membership: a member belongs to an owner's workspace with a role.
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,   -- workspace owner
  member_user_id uuid references auth.users(id) on delete set null,     -- null until invite linked
  invite_email text not null,
  role text not null default 'agent' check (role in ('owner','admin','manager','agent','viewer')),
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  assigned_brands uuid[] default '{}',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, invite_email)
);
create trigger trg_team_members_updated before update on public.team_members
  for each row execute function public.set_updated_at();
create index on public.team_members(owner_id);
create index on public.team_members(member_user_id);

-- Role -> permission matrix (mirrors lib/permissions.ts; stored for visibility /
-- future customization). lib/permissions.ts remains the enforcement source of truth.
create table public.role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions(role, permission)
select 'owner', p from unnest(array[
  'manage_settings','connect_accounts','approve_posts','publish_posts','view_all_leads',
  'assign_leads','view_analytics','review_drafts','manage_content','view_assigned_leads',
  'add_notes','update_lead_status','draft_replies','view_dashboards']) as p;
insert into public.role_permissions(role, permission)
select 'admin', p from unnest(array[
  'manage_settings','connect_accounts','approve_posts','publish_posts','view_all_leads',
  'assign_leads','view_analytics','review_drafts','manage_content','view_assigned_leads',
  'add_notes','update_lead_status','draft_replies','view_dashboards']) as p;
insert into public.role_permissions(role, permission)
select 'manager', p from unnest(array[
  'review_drafts','manage_content','view_assigned_leads','add_notes','view_dashboards']) as p;
insert into public.role_permissions(role, permission)
select 'agent', p from unnest(array[
  'view_assigned_leads','add_notes','update_lead_status','draft_replies','view_dashboards']) as p;
insert into public.role_permissions(role, permission)
select 'viewer', 'view_dashboards';

-- Lead assignment history (the leads table also gets assigned_to/by/at columns).
create table public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_by uuid references auth.users(id),
  note text,
  assigned_at timestamptz not null default now()
);
create index on public.lead_assignments(lead_id);

alter table public.leads add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.leads add column if not exists assigned_by uuid references auth.users(id);
alter table public.leads add column if not exists assigned_at timestamptz;
create index if not exists leads_assigned_to_idx on public.leads(assigned_to);

-- Audit log: approvals, publishing, lead status changes, notes, settings changes.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,   -- workspace owner
  actor_user_id uuid references auth.users(id),                          -- who did it
  action text not null,            -- e.g. 'post_approved','post_published','lead_assigned'
  entity_type text,                -- 'post','lead','account','team','settings'
  entity_id uuid,
  detail text,
  created_at timestamptz not null default now()
);
create index on public.audit_logs(owner_id);
create index on public.audit_logs(created_at);

-- RLS
alter table public.user_profiles    enable row level security;
alter table public.team_members     enable row level security;
alter table public.role_permissions enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.audit_logs        enable row level security;

-- profiles: a user manages their own profile row
create policy "own_profile" on public.user_profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- team_members: the workspace owner manages rows; a member can read their own membership
create policy "owner_manage_team" on public.team_members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "member_read_own" on public.team_members
  for select using (member_user_id = auth.uid());

-- role_permissions: readable by any authenticated user (it's a static matrix)
create policy "read_role_permissions" on public.role_permissions
  for select using (auth.uid() is not null);

create policy "owner_lead_assignments" on public.lead_assignments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner_audit_logs" on public.audit_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
