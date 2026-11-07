// Stage I3A: pure validation logic extracted from vite.config.ts so it
// can be unit-tested directly (see tests/security/viteEnvValidation.test.mjs)
// without needing to actually run a Vite build for every case. Kept at
// the project root (not src/) since vite.config.ts itself imports it,
// and vite.config.ts is not part of the src/ application bundle.
export const PRODUCTION_PROJECT_REF = 'drsidtagxezznqviupsr';
export const FORBIDDEN_IN_PRODUCTION_REFS = ['gcbonlvbgyhsgfayvlvz']; // signal-portal-dev

export function extractProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url);
  return match ? match[1] : null;
}

export class ViteEnvValidationError extends Error {}

/** Throws ViteEnvValidationError (never returns false — callers that
 * want build failure should let the throw propagate) if the given
 * mode/env combination must not be allowed to build. */
export function validateSupabaseEnv(mode: string, env: Record<string, string | undefined>): void {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new ViteEnvValidationError(
      `[vite.config] Refusing to build (mode=${mode}): VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set explicitly — see portal-app/.env.example. No fallback is used.`,
    );
  }

  const ref = extractProjectRef(url);

  if (mode === 'production') {
    if (ref !== PRODUCTION_PROJECT_REF) {
      throw new ViteEnvValidationError(
        `[vite.config] Refusing production build: VITE_SUPABASE_URL resolves to project ref '${ref ?? 'unrecognized'}', but the approved production reference is '${PRODUCTION_PROJECT_REF}'. Set VITE_SUPABASE_URL (e.g. via .env.production.local) to the real production URL before building for release.`,
      );
    }
    return;
  }

  if (ref === PRODUCTION_PROJECT_REF) {
    throw new ViteEnvValidationError(
      `[vite.config] Refusing ${mode} build: VITE_SUPABASE_URL resolves to the PRODUCTION project (${PRODUCTION_PROJECT_REF}). Development and other non-production builds must never target production — point VITE_SUPABASE_URL at the isolated development project instead.`,
    );
  }
}
