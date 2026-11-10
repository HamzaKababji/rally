import { configError } from '../lib/supabase';

export function SetupNeeded() {
  return (
    <main className="mx-auto max-w-app px-safe py-10 pt-safe">
      <p className="mt-6 flex items-center gap-2 text-sm font-bold text-court">
        <span className="ball-dot" /> Rally
      </p>
      <h1 className="mt-3 text-4xl">Connect Supabase</h1>
      {configError && (
        <p role="alert" className="mt-4 rounded-2xl border-2 border-ink bg-ball p-4 font-bold">
          {configError}
        </p>
      )}
      <p className="mt-4 text-muted">
        Create <code className="num text-ink">.env.local</code> in the project folder (copy{' '}
        <code className="num text-ink">.env.example</code>) with:
      </p>
      <pre className="num mt-4 overflow-x-auto rounded-2xl border-2 border-ink bg-surface p-4 text-sm">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...`}
      </pre>
      <p className="mt-4 text-muted">
        Use the <strong className="text-ink">publishable</strong> key, never the secret one. Restart{' '}
        <code className="num text-ink">npm run dev</code> after editing. On Vercel, add both variables under Project →
        Settings → Environment Variables, then redeploy.
      </p>
    </main>
  );
}
