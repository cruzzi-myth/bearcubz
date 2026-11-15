// Scanner test-mode resolution (pure; no Deno APIs besides the getter the
// caller supplies, so it is unit-tested directly).
//
// STANDARD testing runs the dev project's scanner against a mock provider
// endpoint (portal-test-scanner-mock) so ordinary suites consume no real
// Cloudmersive credits. LIVE verification leaves PORTAL_SCANNER_TEST_MODE
// unset and talks to the real provider.
//
// Hard safety rules (fail closed, never open):
//  * Production NEVER honors a test mode. If one is set there, scanning is
//    refused ('forbidden') rather than silently falling back or mocking.
//  * The mock endpoint is DERIVED from this project's own SUPABASE_URL; there
//    is no separately configurable URL, so scans can never be pointed at an
//    arbitrary host.
//  * Any value other than unset/'live'/'mock' is refused.
export const PRODUCTION_PROJECT_REF = 'drsidtagxezznqviupsr';
export const MOCK_FUNCTION_NAME = 'portal-test-scanner-mock';

export type ScanEndpoints =
  | { kind: 'live' }
  | { kind: 'mock'; scanUrl: string; advancedUrl: string }
  | { kind: 'forbidden'; reason: string };

export function resolveScanEndpoints(get: (name: string) => string | undefined): ScanEndpoints {
  const mode = (get('PORTAL_SCANNER_TEST_MODE') ?? '').trim().toLowerCase();
  if (mode === '' || mode === 'live') return { kind: 'live' };
  if (mode !== 'mock') return { kind: 'forbidden', reason: 'UNKNOWN_SCANNER_TEST_MODE' };

  const supabaseUrl = get('SUPABASE_URL') ?? '';
  if (!supabaseUrl || supabaseUrl.toLowerCase().includes(PRODUCTION_PROJECT_REF)) {
    return { kind: 'forbidden', reason: 'SCANNER_TEST_MODE_FORBIDDEN_IN_PRODUCTION' };
  }
  let origin: string;
  try {
    const u = new URL(supabaseUrl);
    if (u.protocol !== 'https:') return { kind: 'forbidden', reason: 'INVALID_SUPABASE_URL' };
    origin = u.origin;
  } catch {
    return { kind: 'forbidden', reason: 'INVALID_SUPABASE_URL' };
  }
  const base = `${origin}/functions/v1/${MOCK_FUNCTION_NAME}`;
  return { kind: 'mock', scanUrl: `${base}/virus/scan/file`, advancedUrl: `${base}/virus/scan/file/advanced` };
}
