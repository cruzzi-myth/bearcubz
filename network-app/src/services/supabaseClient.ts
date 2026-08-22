import { createClient } from '@supabase/supabase-js';

// Same project the standalone /passport/ registration flow talks to
// (see passport/passport.js) — one Supabase Auth authority for the
// whole site. The URL and publishable ("anon") key are not secret;
// they're already public in that file. VITE_SUPABASE_* env vars let
// local dev point at a different project without editing source.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://drsidtagxezznqviupsr.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_Vv_H-4keeGhwKknSz0tOlA_FNNE9YUN';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
