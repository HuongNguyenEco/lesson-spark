-- Lumi — Supabase schema for per-user progress.
-- Run this in the Supabase dashboard → SQL Editor → New query → Run.

-- 1) One progress row per user.
create table if not exists public.progress (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  xp          integer     not null default 0,
  streak      integer     not null default 0,
  last_active date,
  badges      text[]      not null default '{}',
  quests      jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) Row Level Security: each user can only read/write their own row.
alter table public.progress enable row level security;

drop policy if exists "progress_select_own" on public.progress;
create policy "progress_select_own"
  on public.progress for select
  using (auth.uid() = user_id);

drop policy if exists "progress_insert_own" on public.progress;
create policy "progress_insert_own"
  on public.progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "progress_update_own" on public.progress;
create policy "progress_update_own"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) Saved lessons history — one row per generated lesson.
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Untitled lesson',
  topic       text,
  level       text,
  source      text,                 -- the prompt/source the user pasted
  data        jsonb not null,       -- the full Lesson object
  created_at  timestamptz not null default now()
);

-- Sharing: 'private' (owner only) or 'public' (anyone with the link).
alter table public.lessons
  add column if not exists visibility text not null default 'private';

create index if not exists lessons_user_created_idx
  on public.lessons (user_id, created_at desc);

alter table public.lessons enable row level security;

-- Owner can read all their own lessons.
drop policy if exists "lessons_select_own" on public.lessons;
create policy "lessons_select_own"
  on public.lessons for select
  using (auth.uid() = user_id);

-- Anyone (even anonymous) can read a lesson that is public — powers share links.
drop policy if exists "lessons_select_public" on public.lessons;
create policy "lessons_select_public"
  on public.lessons for select
  using (visibility = 'public');

drop policy if exists "lessons_insert_own" on public.lessons;
create policy "lessons_insert_own"
  on public.lessons for insert
  with check (auth.uid() = user_id);

drop policy if exists "lessons_update_own" on public.lessons;
create policy "lessons_update_own"
  on public.lessons for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "lessons_delete_own" on public.lessons;
create policy "lessons_delete_own"
  on public.lessons for delete
  using (auth.uid() = user_id);

-- 4) OAuth 2.1 tables for the MCP server (Claude/ChatGPT connectors).
-- Managed only by the server (service-role key). RLS is enabled with no
-- policies so anon/authenticated clients can never read tokens.
create table if not exists public.oauth_clients (
  client_id      text primary key,
  client_secret  text,
  client_name    text,
  redirect_uris  text[] not null default '{}',
  created_at     timestamptz not null default now()
);

create table if not exists public.oauth_codes (
  code                   text primary key,
  client_id              text not null,
  user_id                uuid not null references auth.users (id) on delete cascade,
  redirect_uri           text,
  code_challenge         text,
  code_challenge_method  text,
  scope                  text,
  expires_at             timestamptz not null,
  created_at             timestamptz not null default now()
);

create table if not exists public.oauth_tokens (
  access_token   text primary key,
  refresh_token  text unique,
  client_id      text not null,
  user_id        uuid not null references auth.users (id) on delete cascade,
  scope          text,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

alter table public.oauth_clients enable row level security;
alter table public.oauth_codes   enable row level security;
alter table public.oauth_tokens  enable row level security;
-- (no policies on purpose: only the service-role key touches these tables)
