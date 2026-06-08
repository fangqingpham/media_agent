-- 0008_stage8_keywords.sql
-- Stage 8: Organic Keyword Automation (lead capture via keyword comments).
--
-- Consistent with earlier stages, this REUSES existing tables rather than
-- duplicating them:
--   * Each matched keyword comment is saved as a real `social_interactions`
--     row (so it also shows up in the Inbox and flows through the same
--     classification/compliance machinery).
--   * Leads are created through the existing `leads` table + leadService.
--   * Campaign analytics are COMPUTED ON THE FLY from keyword_matches joined to
--     lead statuses — no separate keyword_campaign_analytics table (same choice
--     made in Stage 6; avoids a denormalized table that can drift out of sync).
--
-- Two new tables only:
--   keyword_campaigns — the campaign definition (keyword, offer, templates, status)
--   keyword_matches   — one row per matched comment, linking the interaction +
--                       campaign (+ lead once created) and holding the AI drafts.
--
-- SAFETY: nothing here auto-sends. Drafts are generated for human review only.
-- No scraping, no auto-comment, no auto-DM. Matches are entered manually by the
-- admin (or imported one at a time).

create table public.keyword_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  related_post_id uuid references public.post_drafts(id) on delete set null,

  name text not null,
  platform text not null check (platform in ('facebook','instagram','tiktok')),
  keyword text not null,              -- stored normalized (uppercase, no spaces)
  offer_name text,                    -- e.g. "Mortgage Renewal Checklist"
  lead_category text,                 -- one of the Stage 5 lead categories
  related_post_url text,              -- optional published-post URL

  public_reply_template text,         -- optional admin-authored default templates
  dm_template text,
  follow_up_template text,

  status text not null default 'draft' check (status in ('draft','active','paused','ended')),
  start_date date,
  end_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_keyword_campaigns_updated before update on public.keyword_campaigns
  for each row execute function public.set_updated_at();

create index on public.keyword_campaigns(owner_id);
create index on public.keyword_campaigns(brand_id);
create index on public.keyword_campaigns(status);

-- Only ONE active campaign per (brand, platform, keyword). Draft/paused/ended
-- duplicates are allowed (e.g. re-running a seasonal campaign). This is the
-- deterministic backstop for the "duplicate keyword campaign" rule.
create unique index uniq_active_campaign_keyword
  on public.keyword_campaigns (owner_id, brand_id, platform, upper(keyword))
  where status = 'active';

create table public.keyword_matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.keyword_campaigns(id) on delete cascade,
  interaction_id uuid references public.social_interactions(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,

  matched_keyword text not null,
  comment_text text not null,
  person_name text,
  profile_url text,
  platform text not null check (platform in ('facebook','instagram','tiktok')),
  related_post_url text,

  -- AI drafts (filled by /reply; safe-for-public public_reply, private dm)
  public_reply_draft text,
  dm_draft text,
  follow_up_draft text,
  suggested_cta text,
  suggested_lead_category text,

  -- compliance (deterministic scan merged with model self-assessment)
  compliance_risk text check (compliance_risk in ('low','medium','high')),
  human_approval_required boolean not null default false,
  risk_reason text,

  -- manual send tracking (nothing is auto-sent; admin marks what they sent)
  public_reply_sent boolean not null default false,
  dm_sent boolean not null default false,

  status text not null default 'new' check (status in ('new','reply_drafted','lead_created','done','ignored')),
  model text,
  raw_ai jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_keyword_matches_updated before update on public.keyword_matches
  for each row execute function public.set_updated_at();

create index on public.keyword_matches(owner_id);
create index on public.keyword_matches(campaign_id);
create index on public.keyword_matches(interaction_id);
create index on public.keyword_matches(lead_id);

-- RLS — owner-scoped on both tables.
alter table public.keyword_campaigns enable row level security;
alter table public.keyword_matches   enable row level security;

create policy "owner_all_keyword_campaigns" on public.keyword_campaigns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_keyword_matches" on public.keyword_matches
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
