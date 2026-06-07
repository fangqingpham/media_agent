-- 0007_stage7_publishing.sql
-- Stage 7A: Official Facebook Page auto-posting.
-- New tables for connected accounts, encrypted tokens, connection logs,
-- publish attempts, and API error logs. Reuses post_drafts / manual_post_logs.
--
-- SECURITY: access tokens are stored ENCRYPTED (AES-256-GCM) by the app layer.
-- The DB only ever sees ciphertext. RLS keeps every row owner-scoped, and tokens
-- are never selected by any route that returns data to the browser.

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  platform text not null check (platform in ('facebook','instagram','tiktok')),
  account_name text,
  account_id text not null,          -- e.g. Facebook Page ID
  status text not null default 'connected' check (status in ('connected','disconnected','error')),
  scopes text[] default '{}',
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, platform, account_id)
);
create trigger trg_social_accounts_updated before update on public.social_accounts
  for each row execute function public.set_updated_at();
create index on public.social_accounts(owner_id);

-- Tokens kept in a separate table so they're easy to keep out of normal selects.
create table public.social_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.social_accounts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_type text not null default 'page',  -- 'page' | 'user'
  encrypted_token text not null,            -- AES-256-GCM ciphertext (iv:tag:data)
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_social_tokens_updated before update on public.social_tokens
  for each row execute function public.set_updated_at();

create table public.social_connection_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  event text not null,               -- 'connect','disconnect','test','token_refresh'
  detail text,
  created_at timestamptz not null default now()
);
create index on public.social_connection_logs(owner_id);

-- One row per publish attempt (success or failure) — powers /publish-logs.
create table public.publish_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.post_drafts(id) on delete set null,
  account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null,
  status text not null check (status in ('success','failed')),
  platform_post_id text,
  published_url text,
  final_caption text,
  error_message text,
  trigger text default 'manual',     -- 'manual' | 'scheduler'
  created_at timestamptz not null default now()
);
create index on public.publish_attempts(owner_id);
create index on public.publish_attempts(post_id);

create table public.api_error_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text,
  context text,                      -- where it happened, e.g. 'publish','oauth','test'
  error_message text,
  created_at timestamptz not null default now()
);
create index on public.api_error_logs(owner_id);

-- RLS — owner-scoped on everything.
alter table public.social_accounts        enable row level security;
alter table public.social_tokens          enable row level security;
alter table public.social_connection_logs enable row level security;
alter table public.publish_attempts        enable row level security;
alter table public.api_error_logs          enable row level security;

create policy "owner_all_social_accounts" on public.social_accounts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_social_tokens" on public.social_tokens
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_conn_logs" on public.social_connection_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_publish_attempts" on public.publish_attempts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner_all_api_errors" on public.api_error_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
