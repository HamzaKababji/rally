# Supabase

## Applying migrations

There's no CLI step. Open your project in the Supabase dashboard → **SQL Editor** → **New query**,
then paste and **Run** each file in [`migrations/`](migrations/) **in filename order**
(`0001_…`, `0002_…`, …). Every migration is idempotent, so re-running one is harmless.

After `0001_init.sql`, check **Database → Publications → supabase_realtime**: `matches` and
`match_events` should be listed. `players` is deliberately not in the publication. The app
refetches the player list when screens mount or the app regains focus.

The RLS policies give the `anon` role full read/write access. That's deliberate for this
private-link proof of concept; see the comment in `0001_init.sql`.

## Writing new migrations

- **Never edit a migration that has already been run.** Add a new file: `0002_short_name.sql`, `0003_…`.
- **Idempotent:** `create … if not exists`, `create or replace function`, `drop policy if exists` before
  `create policy`, publication changes guarded by a `pg_publication_tables` check (copy the `do $$` block
  from 0001).
- **Self-contained permissions:** don't rely on the dashboard's "Automatically expose new tables" or
  "Enable automatic RLS" settings. Every new table must include:

  ```sql
  alter table public.<table> enable row level security;
  grant select, insert, update, delete on public.<table> to anon, authenticated;
  drop policy if exists "anon full access" on public.<table>;
  create policy "anon full access" on public.<table>
    for all to anon, authenticated using (true) with check (true);
  ```

- **No secrets in SQL or in the repo.** The client only ever uses the publishable key.
