// Stage K1.6E — the quarantine-cleanup scheduler (pg_cron + pg_net,
// see the K1.6E migration) calls its Edge Function with the project's
// real (public) anon key as its Authorization bearer -- required so
// the Supabase Edge Runtime's own gateway-level JWT check (every
// function in this project relies on the platform default, confirmed
// by checking config.toml for any verify_jwt override: none exists)
// lets the request through at all. The anon key alone is NOT
// sufficient authorization for this function (it's the same
// credential any anonymous visitor's browser already holds) -- actual
// "is this really the scheduler" authorization happens via a SEPARATE
// header, X-Signal-Portal-Cron-Secret, carrying a small, dedicated,
// purpose-built secret this stage generates and controls directly,
// scoped to exactly one job. A leak of this secret only ever grants
// "can trigger quarantine cleanup," never full database access.
//
// This deliberately does NOT compare against SUPABASE_SERVICE_ROLE_KEY.
// This project exposes two materially different "service role"
// credential formats (the legacy long-form JWT this codebase's own
// createAdminClient() calls and local tooling use, versus whatever
// Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') actually resolves to
// inside a deployed Edge Function's own runtime, confirmed by direct
// testing to be a different, shorter credential) -- reusing that
// ambiguous, platform-managed value as an authorization secret would
// have been fragile and under-specified.
import { requireAdmin } from './requireAdmin.ts';

export type Caller = { kind: 'admin'; uid: string } | { kind: 'system' };

export async function requireAdminOrSystem(supabaseUrl: string, authHeader: string | null, cronSecretHeader: string | null): Promise<Caller | null> {
  const cronSecret = Deno.env.get('SIGNAL_PORTAL_CRON_SECRET');
  if (cronSecret && cronSecretHeader === cronSecret) return { kind: 'system' };

  const admin = await requireAdmin(supabaseUrl, authHeader);
  if (!admin) return null;
  return { kind: 'admin', uid: admin.uid };
}
