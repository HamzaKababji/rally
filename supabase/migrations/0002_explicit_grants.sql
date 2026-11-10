-- Rally: make table privileges and RLS explicit.
--
-- 0001_init.sql relied on the dashboard's "Automatically expose new tables" setting for
-- GRANTs. This migration states them outright so the schema works on any project,
-- whatever that setting is. Safe to run more than once; a no-op where already applied.
--
-- PROOF OF CONCEPT ONLY: anon gets full read/write (see the RLS note in 0001_init.sql).

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.players      to anon, authenticated;
grant select, insert, update, delete on table public.matches      to anon, authenticated;
grant select, insert, update, delete on table public.match_events to anon, authenticated;

-- Re-assert RLS and the policies (idempotent).
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
