export function SetupNeeded() {
  return (
    <main className="mx-auto max-w-app px-safe py-10 pt-safe">
      <p className="mt-6 flex items-center gap-2 text-sm font-bold text-court">
        <span className="ball-dot" /> Rally
      </p>
      <h1 className="mt-3 text-4xl">Connect Supabase</h1>
      <p className="mt-3 text-muted">
        Rally needs a Supabase project to store matches. Create <code className="num text-ink">.env.local</code> in the
        project folder with:
      </p>
      <pre className="num mt-4 overflow-x-auto rounded-2xl border-2 border-ink bg-surface p-4 text-sm">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}
      </pre>
      <p className="mt-4 text-muted">
        Then run the SQL in <code className="num text-ink">supabase/migrations/0001_init.sql</code> and restart{' '}
        <code className="num text-ink">npm run dev</code>. On Vercel, add both variables under Project Settings →
        Environment Variables and redeploy.
      </p>
    </main>
  );
}
