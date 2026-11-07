// Hard safety guard for every integration test entry point. This is not
// a warning — it throws, and run.mjs treats any throw here as fatal
// before importing a single scenario module. Per the Stage I2A brief:
// "Tests must refuse to execute against the production project. Do not
// rely only on a warning message."
export const PRODUCTION_PROJECT_REF = 'drsidtagxezznqviupsr';

export class ProductionGuardError extends Error {}

/** Extracts the project ref from a Supabase URL of the form
 * https://<ref>.supabase.co (cloud) — a local stack's URL
 * (http://127.0.0.1:54321 or similar) never matches this shape at
 * all, so it can never collide with a cloud project ref. */
function extractProjectRef(supabaseUrl) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(supabaseUrl ?? '');
  return match ? match[1] : null;
}

/**
 * Throws unless ALL of the following hold:
 *  - SUPABASE_URL is actually set (missing config is treated as unsafe,
 *    not "assume local/safe" — fail closed).
 *  - its project ref is not the known production ref.
 *  - the explicit opt-in flag is set, so a correctly-pointed env still
 *    requires a deliberate, separate "yes, run these" signal.
 */
export function assertSafeToRunIntegrationTests(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ProductionGuardError(
      'Refusing to run: no SUPABASE_URL/VITE_SUPABASE_URL is configured. ' +
        'Integration tests require an isolated test project — see ' +
        'supabase/SIGNAL_PORTAL_INTEGRATION_PLAN.md §1 and portal-app/.env.integration.example.',
    );
  }

  const ref = extractProjectRef(supabaseUrl);
  if (ref === PRODUCTION_PROJECT_REF) {
    throw new ProductionGuardError(
      `Refusing to run: SUPABASE_URL points at the production project (${PRODUCTION_PROJECT_REF}). ` +
        'Integration tests must only ever target an isolated development/test project.',
    );
  }

  if (env.ALLOW_INTEGRATION_TESTS !== '1') {
    throw new ProductionGuardError(
      'Refusing to run: ALLOW_INTEGRATION_TESTS=1 was not set. This is a deliberate second gate — ' +
        'pointing at a non-production URL alone is not treated as sufficient authorization to run ' +
        'tests that create/modify data.',
    );
  }

  return { supabaseUrl, projectRef: ref };
}
