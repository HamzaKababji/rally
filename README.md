# Rally 🎾

A shared tennis scorebook for a friend group. One link, no login. Anyone can start a match, score it point by point, leave it unfinished, and pick it up again or fix it later from any phone. Scores sync live between devices.

- **Stack:** Vite + React + TypeScript, React Router, Tailwind CSS, TanStack Query, Supabase (Postgres + Realtime), Vitest, vite-plugin-pwa. Deployed on Vercel.
- **Event-sourced scoring:** the database stores an ordered log of events per match (`point`, `game`, `set_score`, `serve_setup`, `next_server`). Every score you see comes from the pure function `deriveMatchState(match, events)` in [`src/scoring/engine.ts`](src/scoring/engine.ts). Undo deletes the last event. Edits change or remove any event, and the score is rebuilt from the log.

> **Security note:** there is no login. The publishable key and permissive RLS policies let anyone with the link read and write everything. That's fine for a private link among friends. Don't store anything sensitive.

---

## 1. Supabase setup

1. **Create a project** at <https://supabase.com> → **New project**. The free plan is enough, and any region works.
2. **Run the migrations in order.** Open **SQL Editor → New query**, then paste and **Run** each file in [`supabase/migrations/`](supabase/migrations/) in filename order (`0001_init.sql` first, then any later `0002_…` files). They're idempotent, so re-running one is safe. Afterwards, **Database → Publications → `supabase_realtime`** should list `matches` and `match_events`. See [`supabase/README.md`](supabase/README.md) for the rules for writing new migrations.
3. **Copy two values** from **Project Settings → API Keys / Data API**: the **Project URL** and the **publishable key** (`sb_publishable_…`). Never use the secret/service_role key. Anything in a `VITE_` variable ships to every browser, and the app refuses to start if it detects a secret key.
4. **Set the env vars.**
   - **Locally:** `cp .env.example .env.local`, then fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable key goes in this variable). `.env.local` is gitignored, so don't commit it.
   - **On Vercel:** Project → **Settings → Environment Variables**, add both, then **redeploy**. Vite bakes the values in at build time, so changes only take effect after a new deployment.

> **Free tier pausing:** Supabase pauses free projects after about a week of inactivity. If the app suddenly can't load anything, open the project in the Supabase dashboard and click **Restore project**. Your data is kept.

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

**Live:** <https://rally-swart-three.vercel.app>, auto-deployed from `main` on GitHub (`HamzaKababji/rally`). Every push to `main` redeploys production.

To set it up from scratch:

1. Push this repo to GitHub.
2. On <https://vercel.com>, **Add New → Project** and import the repo. Vercel detects Vite, and the defaults (`npm run build`, output `dist`) are correct.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable key).
   - Pick the **Config** (plain) type, not **Secret**, and tick all three environments. These values are public anyway, because Vite bundles them into the client JS. Vercel may default to Secret, which can't be edited later and doesn't allow a `VITE_` variable in Development. To fix one, delete the variable, re-add it as Config, and redeploy.
   - Development only matters for `vercel dev`. Local `npm run dev` reads `.env.local`.
4. **Deploy.** `vercel.json` rewrites every path to `index.html`, so deep links like `/m/<id>` and `/leaderboard` load directly. Static files such as `/sw.js` and the icons are still served as files.
   After adding or changing env vars, **redeploy**. Vite bakes them in at build time.

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
- **Scores don't update live on the other phone:** check step 2 of the Supabase setup (Realtime publication). Switching away from the app and back also refetches.
- **`new row violates row-level security policy`:** the migration didn't finish. Run it again; it's safe to re-run.
