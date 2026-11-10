# Rally 🎾

A shared tennis scorebook for a friend group. One link, no login. Anyone can start a match, score it point by point, leave it unfinished, and pick it up again or fix it later from any phone. Scores sync live between devices.

- **Stack:** Vite + React + TypeScript, React Router, Tailwind CSS, TanStack Query, Supabase (Postgres + Realtime), Vitest, vite-plugin-pwa. Deployed on Vercel.
- **Event-sourced scoring:** the database stores an ordered log of events per match (`point`, `game`, `set_score`, `serve_setup`, `next_server`). Every score you see comes from the pure function `deriveMatchState(match, events)` in [`src/scoring/engine.ts`](src/scoring/engine.ts). Undo deletes the last event. Edits change or remove any event, and the score is rebuilt from the log.

> **Security note:** there is no login. The anon key and permissive RLS policies let anyone with the link read and write everything. That's fine for a private link among friends. Don't store anything sensitive.

---

## 1. Set up Supabase (about 5 minutes, free)

1. Go to <https://supabase.com>, sign in, and click **New project**. Any name and region work; the free plan is enough.
2. When the project is ready, open **SQL Editor → New query**, paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and click **Run**. This creates the tables and RLS policies and turns on Realtime.
3. Check that Realtime is on for both tables: **Database → Publications → `supabase_realtime`** should list `matches` and `match_events`. The migration does this for you; you're just confirming. You can also flip the **Realtime** toggle on each table in the Table Editor.
4. Open **Project Settings → API** (called **Data API / API Keys** in newer dashboards) and copy:
   - the **Project URL**, e.g. `https://abcd1234.supabase.co`
   - the **anon public** key

## 2. Run locally on WSL (Ubuntu)

Requires Node.js 20 or newer (`node -v`). If you need it: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`.

```bash
cd ~/Projects/Rally            # or wherever this folder lives
npm install
cp .env.example .env.local
nano .env.local                # paste VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Open <http://localhost:5173> in your Windows browser. (WSL2 forwards localhost automatically.)

To try it on your phone over Wi-Fi, run `npm run dev -- --host` and open the `Network:` URL it prints. On WSL2 you may need to forward the port from Windows, so deploying to Vercel (below) is usually easier.

On first open Rally asks **"Who are you?"**. With an empty database you can tap **Load demo data** to get 4 sample players and a live doubles match. The same button is on the **Players** tab while there are no players.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Vitest unit tests (scoring engine, stats, optimistic overlay) |
| `npm run lint` | ESLint (also stops `src/scoring/` from importing React or Supabase) |
| `npm run build` | Type-check and production build to `dist/` (includes the PWA service worker) |
| `npm run preview` | Serve the production build locally |
| `npm run icons` | Regenerate the PWA PNG icons in `public/` |

## 3. Deploy to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket):

   ```bash
   git remote add origin git@github.com:<you>/rally.git
   git push -u origin main
   ```

2. On <https://vercel.com> click **Add New → Project** and import the repo. Vercel detects Vite, so the defaults (`npm run build`, output `dist`) are right.
3. Under **Environment Variables**, add both:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. `vercel.json` already has the SPA rewrite, so deep links like `/m/<id>` work.
   If you add or change env vars later, **redeploy**. Vite bakes them in at build time.

### Put it on everyone's phone

Share the Vercel URL in the group chat, then:

- **iPhone (Safari):** Share button → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Add to Home screen** / **Install app**.

It opens full-screen like a native app, with the Rally icon.

---

## How it works

```text
src/
  scoring/      Pure TypeScript. No React or Supabase (enforced by ESLint).
    types.ts      Event payloads, MatchFormat (+ defaults), MatchState
    engine.ts     deriveMatchState(), summarize(), classifySetScore()
    describe.ts   Labels for the event log, set formatting ("7–6(5)", "[10–8]")
    engine.test.ts
  data/         Supabase access + React Query hooks
    events.ts     Event log: serialized writes, optimistic overlay, seq conflict retry
    matches.ts    Match CRUD + caching derived status/winner/summary on the row
    players.ts, realtime.ts, identity.tsx, seed.ts
  lib/          stats (leaderboard / head-to-head, tested), names, Supabase client
  components/   ScoreTable, Sheet, forms, layout…
  screens/      Home, NewMatch, LiveScoring, MatchDetail, Leaderboard, HeadToHead, Players
supabase/migrations/0001_init.sql
```

- **Tennis rules covered:** advantage and no-ad scoring; best of 1, 3 or 5 sets; 6- or 4-game sets; 7-point tiebreaks at games-all; an optional 10-point match tiebreak in place of the final set. Serving: singles alternate every game; doubles rotate A1 → B1 → A2 → B2, and team B's first server is chosen when their first service game comes up. Court side follows the points played. Doubles receivers keep their deuce/ad sides for the whole set. In a tiebreak the serve changes after point 1, then every 2 points, and ends change every 6 points. After a tiebreak set, whoever received first serves first. Ends also change after odd games. The engine flags break, set and match points, and ignores points scored after the match is over.
- **Mixed logs:** `game` awards a whole game; `set_score` sets or corrects a whole set. You can enter a final score, or a score still in progress, and keep playing from it. Correcting an earlier set can change the match result.
- **Caching:** after every write, the client re-derives the state and stores `status`, `winner` and a compact `summary` (set scores, current points, server) on the `matches` row. Lists and the leaderboard read only that row.
- **Concurrency:** each event is inserted with `seq = max + 1`, and `(match_id, seq)` is unique. If another phone took that seq, the client refetches and retries once, then shows *"Someone else just scored. Refreshed."* Writes from one phone run one at a time, in order. They show up straight away as an optimistic overlay and are rolled back if they fail.
- **Realtime:** one app-wide channel listens to `matches` and `match_events` and refreshes the affected queries.
- **Identity:** your chosen player is stored in `localStorage` and written to `created_by` on the matches and events you create. Tap your name in the header to switch.

## Troubleshooting

- **"Connect Supabase" screen:** `.env.local` is missing or still has placeholder values. Fix it and restart `npm run dev`.
- **Scores don't update live on the other phone:** check step 3 of the Supabase setup (Realtime publication). Switching away from the app and back also refetches.
- **`new row violates row-level security policy`:** the migration didn't finish. Run it again; it's safe to re-run.
