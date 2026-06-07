-- 0004_stage4_interactions.sql
-- Stage 4: AI Comment & DM Reply Assistant (semi-manual).
-- Consolidated design (consistent with earlier stages): one main table
-- `social_interactions` holds the pasted message + its AI classification (1:1)
-- + the latest AI reply drafts (jsonb). A separate `interaction_status_history`
-- table mirrors the Stage 3 status-history pattern. No leads CRM here (Stage 5),
-- but lead-candidate fields are included as the spec requests.

create table public.social_interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  related_post_id uuid references public.post_drafts(id) on delete set null,

  platform text not null check (platform in ('facebook','instagram','tiktok')),
  interaction_type text not null check (interaction_type in
    ('public_comment','private_dm','story_reply','post_reply')),
  person_name text,
  profile_url text,
  original_message text not null,
  received_at timestamptz,
  notes text,

  status text not null default 'new' check (status in
    ('new','classified','reply_drafted','replied_manually','needs_follow_up','ignored','spam','lead_candidate')),

  -- AI classification (1:1, filled in by /classify)
  categories text[] default '{}',
  intent_summary text,
  lead_potential text check (lead_potential in ('none','low','medium','high')),
  urgency text check (urgency in ('low','medium','high')),
  compliance_risk text check (compliance_risk in ('low','medium','high')),
  human_approval_required boolean not null default false,
  risk_reason text,
  suggested_next_action text,
  is_lead_candidate boolean not null default false,
  suggested_lead_category text,
  classified_at timestamptz,

  -- AI reply drafts (filled in by /reply)
  reply_drafts jsonb,   -- { public_reply, dm_reply, follow_up_question, booking_cta, disclaimer }
  replied_at timestamptz,

  admin_notes text,
  model text,
  raw_classification jsonb,
  raw_reply jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_social_interactions_updated before update on public.social_interactions
  for each row execute function public.set_updated_at();

create index on public.social_interactions(brand_id);
create index on public.social_interactions(owner_id);
create index on public.social_interactions(status);
create index on public.social_interactions(platform);

create table public.interaction_status_history (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references public.social_interactions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.interaction_status_history(interaction_id);

-- RLS — owner-scoped
alter table public.social_interactions      enable row level security;
alter table public.interaction_status_history enable row level security;

create policy "owner_all_interactions" on public.social_interactions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_interaction_history" on public.interaction_status_history
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
