# Supabase setup

1. Open your project in the Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the whole of [`migrations/0001_init.sql`](migrations/0001_init.sql) and click **Run**.
   It is safe to run more than once.
3. Check **Database → Publications → supabase_realtime**: `matches` and `match_events`
   should both be switched on. (The migration adds them; this is just to confirm.
   You can also toggle them under **Table Editor → table → Realtime**.)

That's it: no auth providers to configure. The RLS policies give the `anon` role full
read/write access, which is deliberate for this private-link proof of concept.
