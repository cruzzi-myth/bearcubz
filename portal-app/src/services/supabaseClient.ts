import { createClient } from '@supabase/supabase-js';

// Stage I3A: no hardcoded fallback — a prior version of this file
// fell back to the production URL/anon key whenever the env vars
// were unset, which silently selected production by default and
// masked the real bug (portal-app/.env.local, a dev convenience
// file, overriding it with development values for every build mode
// including production). Both values are public regardless (the
// anon key is meant to ship in frontend bundles, and is already
// public elsewhere in this repo) — "no fallback" is about failing
// loudly on misconfiguration, not about hiding a secret.
//
// The real enforcement is vite.config.ts's validateSupabaseEnv,
// which runs in Node at build time and refuses to build at all if
// these are missing or point at the wrong project for the mode. This
// check is a runtime safety net for any code path that reaches the
// browser without having gone through that build-time gate (e.g. a
// different build tool, or `vite` invoked in a way that skips
// config validation) — defense in depth, not the primary guarantee.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Signal Portal: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set — see portal-app/.env.example. No fallback is used.',
  );
}

// Same Supabase project every other app in this repo talks to (see
// network-app/src/services/supabaseClient.ts) when correctly pointed
// at production. Signal Portal access itself is never granted by
// having this client at all; it's gated entirely by the
// artist_invitations / collaboration_members tables and their RLS
// policies (see the Stage C/D migrations) — this client is just how
// an authorized read is made, same as every other Supabase-backed
// app here.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
