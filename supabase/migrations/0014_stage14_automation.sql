-- 0014_stage14_automation.sql
-- Stage 14: Full Automation Rules Engine (SAFE, internal-workflow only).
--
-- A polling/evaluation runner (like the Stage 7 scheduler) evaluates active rules
-- against current state and performs SAFE internal actions only: reminders,
-- notifications, routing high-risk posts to compliance, drafting replies (never
-- sending), recommending repurposes, and publishing ONLY via the existing
-- scheduler (which enforces approval + compliance gates).
--
-- Hard guardrails (enforced in lib/automationTypes + service, at save AND run):
-- rules can NEVER auto-like, auto-follow, scrape, mass-comment, cold-DM,
-- auto-send sensitive replies, or publish unapproved/high-risk content.
--
-- DESIGN NOTE: the spec lists automation_conditions + automation_actions as
-- separate tables. Consistent with this project's consolidation pattern (e.g.
-- reply_drafts/claims as jsonb), conditions and actions are stored as jsonb on
-- the rule itself — they're always read/written together with the rule and never
-- queried independently, so separate tables would only add join overhead.

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  name text not null,
  trigger text not null check (trigger in (
    'post_scheduled_due','post_published','interaction_created','keyword_matched',
    'lead_created','lead_score_updated','followup_due','performance_threshold_met',
    'compliance_risk_detected','publish_failed')),
  conditions jsonb not null default '{}'::jsonb,   -- e.g. { "min_score": 80, "metric": "reach", "min_value": 1000 }
  actions jsonb not null default '[]'::jsonb,      -- [{ "type": "notify_admin", "params": {...} }, ...]
  status text not null default 'active' check (status in ('active','paused')),
  last_run_at timestamptz,
  run_count int not null default 0,
  error_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_automation_rules_updated before update on public.automation_rules
  for each row execute function public.set_updated_at();
create index on public.automation_rules(owner_id);
create index on public.automation_rules(status);

create table public.automation_rule_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete cascade,
  trigger text,
  status text not null check (status in ('success','failed','skipped')),
  action_taken text,
  detail text,
  error_message text,
  created_at timestamptz not null default now()
);
create index on public.automation_rule_runs(rule_id);
create index on public.automation_rule_runs(owner_id);

create table public.automation_errors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  context text,
  error_message text,
  created_at timestamptz not null default now()
);
create index on public.automation_errors(owner_id);

-- Reminders + admin notifications produced by rules (the safe "output" surface).
create table public.automation_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  kind text not null default 'notify' check (kind in ('notify','reminder')),
  title text not null,
  body text,
  level text not null default 'info' check (level in ('info','warn','urgent')),
  dedup_key text,                 -- prevents duplicate notifications across runs
  read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, dedup_key)
);
create index on public.automation_notifications(owner_id);
create index on public.automation_notifications(read);

-- RLS — owner-scoped
alter table public.automation_rules         enable row level security;
alter table public.automation_rule_runs     enable row level security;
alter table public.automation_errors        enable row level security;
alter table public.automation_notifications enable row level security;

create policy "owner_all_automation_rules" on public.automation_rules
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_automation_runs" on public.automation_rule_runs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_automation_errors" on public.automation_errors
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_automation_notifications" on public.automation_notifications
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
