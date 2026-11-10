-- Rally: shared tennis scorebook. Initial schema.
-- Paste this whole file into the Supabase SQL editor and run it once.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) between 1 and 40),
  created_at  timestamptz not null default now()
);

create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('singles', 'doubles')),
  team_a      uuid[] not null,
  team_b      uuid[] not null,
  format      jsonb not null default '{}'::jsonb,
  status      text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  winner      text null check (winner in ('A', 'B')),
  -- Cached snapshot of the derived state (set scores, current points, server)
  -- so lists and the leaderboard don't replay every event log. The event log
  -- in match_events is always the source of truth.
  summary     jsonb not null default '{}'::jsonb,
  played_on   date not null default current_date,
  location    text,
  notes       text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (
    (kind = 'singles' and cardinality(team_a) = 1 and cardinality(team_b) = 1)
    or (kind = 'doubles' and cardinality(team_a) = 2 and cardinality(team_b) = 2)
  )
);

create index if not exists matches_status_played_idx on public.matches (status, played_on desc);

create table if not exists public.match_events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  seq         int not null,
  payload     jsonb not null check (payload ? 'kind'),
  created_by  text,
  created_at  timestamptz not null default now(),
  -- Two phones scoring at once both try seq = max+1; one wins, the other retries.
  unique (match_id, seq)
);

create index if not exists match_events_match_seq_idx on public.match_events (match_id, seq);

-- Keep updated_at fresh.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists matches_touch on public.matches;
create trigger matches_touch before update on public.matches
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- PROOF OF CONCEPT ONLY: there is no login. Anyone holding the anon key (i.e.
-- anyone with the app link) can read AND write everything. That is fine for a
-- private link shared among friends, but do not put anything sensitive here.
-- To lock it down later, add Supabase Auth and replace these policies.
-- ---------------------------------------------------------------------------

alter table public.players      enable row level security;
alter table public.matches      enable row level security;
alter table public.match_events enable row level security;

drop policy if exists "anon full access" on public.players;
drop policy if exists "anon full access" on public.matches;
drop policy if exists "anon full access" on public.match_events;

create policy "anon full access" on public.players
  for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.matches
  for all to anon, authenticated using (true) with check (true);
create policy "anon full access" on public.match_events
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Full old rows on DELETE so clients can tell which match an undo belonged to.
alter table public.match_events replica identity full;
alter table public.matches      replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_events'
  ) then
    alter publication supabase_realtime add table public.match_events;
  end if;
end $$;
