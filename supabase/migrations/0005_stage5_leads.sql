-- 0005_stage5_leads.sql
-- Stage 5: Lead Capture CRM.
-- Consolidated design (consistent with earlier stages): one main `leads` table
-- holds contact info, category/status/priority, AI scoring, and follow-up fields.
-- Notes + all activity (status/priority/score/contact/follow-up changes, notes)
-- are recorded in a single `lead_activity_logs` table. Leads link back to a
-- source social_interaction and to the brand. No separate lead_notes /
-- lead_followups / lead_sources tables — those are folded in to avoid join
-- overhead; see TODOs if you later want note threads as their own table.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_interaction_id uuid references public.social_interactions(id) on delete set null,
  source_post_id uuid references public.post_drafts(id) on delete set null,

  -- contact
  name text,
  platform text check (platform in ('facebook','instagram','tiktok')),
  profile_url text,
  email text,
  phone text,
  city text,
  province text,

  -- classification
  lead_category text,        -- one of the Stage 5 categories (validated in app)
  lead_status text not null default 'new' check (lead_status in
    ('new','contacted','waiting_for_reply','qualified','unqualified',
     'booked_call','converted','closed_lost','follow_up_later')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  lead_score int check (lead_score between 0 and 100),

  -- context
  original_message text,
  intent_summary text,
  conversation_summary text,
  notes text,

  -- AI scoring extras
  score_reason text,
  suggested_next_action text,
  suggested_follow_up_message text,
  missing_information text[] default '{}',
  scored_at timestamptz,

  -- follow-up
  follow_up_date date,
  follow_up_notes text,
  last_contact_date date,

  model text,
  raw_score jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

create index on public.leads(brand_id);
create index on public.leads(owner_id);
create index on public.leads(lead_status);
create index on public.leads(priority);
create index on public.leads(platform);
create index on public.leads(follow_up_date);
create index on public.leads(source_interaction_id);

-- Activity log — one row per tracked event.
create table public.lead_activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null,      -- e.g. 'created','status_changed','priority_changed','note_added',...
  detail text,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.lead_activity_logs(lead_id);

-- RLS — owner-scoped
alter table public.leads              enable row level security;
alter table public.lead_activity_logs enable row level security;

create policy "owner_all_leads" on public.leads
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_lead_logs" on public.lead_activity_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
