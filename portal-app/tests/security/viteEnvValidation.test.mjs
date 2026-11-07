import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(new URL('../../viteEnvValidation.ts', import.meta.url).pathname);
const { validateSupabaseEnv, extractProjectRef, PRODUCTION_PROJECT_REF } = mod;

function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const DEV_URL = 'https://gcbonlvbgyhsgfayvlvz.supabase.co';
const OTHER_URL = 'https://some-other-project.supabase.co';

// --- the exact Stage I3 bug this exists to prevent ---
assert(
  'production mode + dev project URL (the actual Stage I3 bug) -> throws, refuses to build',
  throws(() => validateSupabaseEnv('production', { VITE_SUPABASE_URL: DEV_URL, VITE_SUPABASE_ANON_KEY: 'x' })),
);

assert(
  'production mode + correct production URL -> does not throw',
  !throws(() => validateSupabaseEnv('production', { VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_ANON_KEY: 'x' })),
);

assert(
  'production mode + an unrelated third project URL -> throws (not just "not dev", must BE production)',
  throws(() => validateSupabaseEnv('production', { VITE_SUPABASE_URL: OTHER_URL, VITE_SUPABASE_ANON_KEY: 'x' })),
);

// --- no silent fallback ---
assert('missing VITE_SUPABASE_URL entirely -> throws, never falls back', throws(() => validateSupabaseEnv('production', { VITE_SUPABASE_ANON_KEY: 'x' })));
assert('missing VITE_SUPABASE_ANON_KEY entirely -> throws', throws(() => validateSupabaseEnv('production', { VITE_SUPABASE_URL: PROD_URL })));
assert('both missing -> throws', throws(() => validateSupabaseEnv('production', {})));
assert('missing in development mode too -> throws (no fallback in any mode)', throws(() => validateSupabaseEnv('development', {})));

// --- the reverse direction: production ref must never leak into non-production builds ---
assert(
  'development mode + production project URL -> throws (isolation must hold both directions)',
  throws(() => validateSupabaseEnv('development', { VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_ANON_KEY: 'x' })),
);
assert(
  'development mode + dev project URL -> does not throw',
  !throws(() => validateSupabaseEnv('development', { VITE_SUPABASE_URL: DEV_URL, VITE_SUPABASE_ANON_KEY: 'x' })),
);
assert(
  'development mode + some other non-production URL -> does not throw (only production is forbidden in dev, not "anything but THE dev ref")',
  !throws(() => validateSupabaseEnv('development', { VITE_SUPABASE_URL: OTHER_URL, VITE_SUPABASE_ANON_KEY: 'x' })),
);

// --- extractProjectRef itself ---
assert('extractProjectRef reads the ref from a real Supabase URL', extractProjectRef(PROD_URL) === PRODUCTION_PROJECT_REF);
assert('extractProjectRef returns null for a non-Supabase URL', extractProjectRef('https://example.com') === null);
assert('extractProjectRef returns null for undefined', extractProjectRef(undefined) === null);
assert('extractProjectRef returns null for an empty string', extractProjectRef('') === null);

report('viteEnvValidation (Stage I3A fail-closed production-build guard)');
