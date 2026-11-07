import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Required env vars, auto-injected by Supabase into every Edge
 * Function — never set by hand, never committed anywhere. */
export function requiredEnv(): { supabaseUrl: string; serviceKey: string } | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return { supabaseUrl, serviceKey };
}

/** Full-privilege client. Bypasses RLS — use only for the specific
 * writes/reads a function has already decided, through its own
 * checks, that it's allowed to perform. Never forward this client's
 * access to anything the caller supplied unchecked. */
export function createAdminClient(supabaseUrl: string, serviceKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client scoped to the calling user's own JWT — reads through this
 * client are RLS-enforced exactly as if the browser had made them
 * directly. This is how a function makes an authorization decision
 * by asking Postgres, instead of re-implementing the same check in
 * application code where it could drift from the real RLS policy. */
export function createUserClient(supabaseUrl: string, authHeader: string): SupabaseClient {
  return createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}
