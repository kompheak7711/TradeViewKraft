-- TradingViewKraft: per-user synced documents (layouts, watchlists, alerts, settings).
-- Each row stores a JSON document; the client does last-write-wins by updated_at.
-- Run this in the Supabase SQL editor (Free plan) or with `supabase db push`.

create extension if not exists "pgcrypto";

create table if not exists public.layouts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists layouts_user_idx on public.layouts (user_id);
create index if not exists watchlists_user_idx on public.watchlists (user_id);
create index if not exists alerts_user_idx on public.alerts (user_id);

-- Row-level security: a user can only see and change their own rows.
alter table public.layouts enable row level security;
alter table public.watchlists enable row level security;
alter table public.alerts enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['layouts', 'watchlists', 'alerts', 'settings'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$s', t);
    execute format('create policy "%1$s_select_own" on public.%1$s for select using (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_insert_own" on public.%1$s for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_update_own" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "%1$s_delete_own" on public.%1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Realtime: lets a second device pick up changes without polling.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.layouts, public.watchlists, public.alerts, public.settings;
