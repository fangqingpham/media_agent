-- 0011_stage11_compliance.sql
-- Stage 11: Compliance Review Agent.
--
-- A dedicated review layer for mortgage / lending / landlord-tenant / property /
-- buying-selling content. Combines an AI reviewer with the existing DETERMINISTIC
-- scanners (lib/compliance.ts + lib/interactionCompliance.ts) so a risky claim the
-- model misses is still caught — and the model can never downgrade a hard-flagged
-- phrase. High-risk content must receive an explicit approved decision before the
-- Stage 7 publisher will post it.
--
-- New tables:
--   compliance_reviews         — one AI+scanner review of a piece of content
--   compliance_flags           — individual risky phrases/issues for a review
--   compliance_decisions       — admin decisions (approve / reject / needs changes)
--   compliance_rewrite_history — record of safer-rewrite applications
--
-- Reuses post_drafts (a review can target a post; reviews may also be ad-hoc text).

create table public.compliance_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  post_id uuid references public.post_drafts(id) on delete cascade,

  source_text text not null,
  risk_level text not null check (risk_level in ('low','medium','high')),
  why_risky text,
  issues_found jsonb,            -- string[]
  safer_rewrite text,
  disclaimers jsonb,             -- string[] of required disclaimers
  disclaimer_required boolean not null default false,
  human_approval_required boolean not null default false,
  can_publish boolean not null default false,   -- advisory; high-risk is always false here
  reviewer_notes text,           -- AI reviewer notes
  scanner_matched text[] default '{}',          -- deterministic scanner hits

  model text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);
create index on public.compliance_reviews(owner_id);
create index on public.compliance_reviews(post_id);
create index on public.compliance_reviews(risk_level);

create table public.compliance_flags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.compliance_reviews(id) on delete cascade,
  flag_type text not null,       -- e.g. 'rate_claim','guaranteed_approval','fair_housing','keyword'
  phrase text,                   -- the risky phrase
  detail text,                   -- why it's risky
  source text not null default 'ai' check (source in ('ai','scanner')),
  created_at timestamptz not null default now()
);
create index on public.compliance_flags(review_id);

create table public.compliance_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.compliance_reviews(id) on delete cascade,
  post_id uuid references public.post_drafts(id) on delete cascade,
  decision text not null check (decision in ('approved','rejected','needs_changes')),
  note text,
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.compliance_decisions(review_id);
create index on public.compliance_decisions(post_id);

create table public.compliance_rewrite_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid references public.compliance_reviews(id) on delete set null,
  post_id uuid references public.post_drafts(id) on delete cascade,
  before_text text,
  after_text text,
  applied boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.compliance_rewrite_history(post_id);

-- RLS — owner-scoped on all four tables.
alter table public.compliance_reviews        enable row level security;
alter table public.compliance_flags          enable row level security;
alter table public.compliance_decisions      enable row level security;
alter table public.compliance_rewrite_history enable row level security;

create policy "owner_all_compliance_reviews" on public.compliance_reviews
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_compliance_flags" on public.compliance_flags
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_compliance_decisions" on public.compliance_decisions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_compliance_rewrites" on public.compliance_rewrite_history
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
