import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
// A publishable key (sb_publishable_…) or the legacy anon JWT. Never a secret/service_role key.
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  // Legacy JWT keys: refuse the service_role one.
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload?.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

/** Why Supabase can't be used, or null if it's configured. Never includes the key value. */
function checkConfig(): string | null {
  const problems: string[] = [];
  if (!url) problems.push('VITE_SUPABASE_URL is missing.');
  else if (url.includes('your-project-ref')) problems.push('VITE_SUPABASE_URL still has the placeholder value from .env.example.');
  else if (!/^https?:\/\/.+/.test(url)) problems.push('VITE_SUPABASE_URL must be a full URL like https://xxxx.supabase.co.');
  if (!anonKey) problems.push('VITE_SUPABASE_ANON_KEY is missing.');
  else if (anonKey.startsWith('your-')) problems.push('VITE_SUPABASE_ANON_KEY still has the placeholder value from .env.example.');
  else if (looksLikeSecretKey(anonKey)) {
    problems.push(
      'VITE_SUPABASE_ANON_KEY is a secret/service_role key. Use the publishable (sb_publishable_…) key instead: anything in VITE_ variables ships to every browser.',
    );
  }
  return problems.length ? problems.join(' ') : null;
}

export const configError = checkConfig();
export const isConfigured = configError === null;

if (configError) console.error(`[Rally] Supabase not configured: ${configError}`);

/**
 * Anonymous client. There's no login: the publishable/anon key plus permissive RLS
 * policies (see supabase/migrations/0001_init.sql) is the whole security model for this PoC.
 */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error(`Supabase is not configured: ${configError}`);
  return supabase;
}
