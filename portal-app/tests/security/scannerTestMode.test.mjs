import { assert, importCompiled, report } from './runner.mjs';
const { resolveScanEndpoints, PRODUCTION_PROJECT_REF, MOCK_FUNCTION_NAME } = await importCompiled(new URL('../../../supabase/functions/_shared/scannerTestMode.ts', import.meta.url).pathname);
const env = (o) => (n) => o[n];
const DEV = 'https://gcbonlvbgyhsgfayvlvz.supabase.co';
const PROD = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

assert('unset mode = live (real provider)', resolveScanEndpoints(env({ SUPABASE_URL: DEV })).kind === 'live');
assert('empty mode = live', resolveScanEndpoints(env({ SUPABASE_URL: DEV, PORTAL_SCANNER_TEST_MODE: '' })).kind === 'live');
assert('explicit "live" = live', resolveScanEndpoints(env({ SUPABASE_URL: DEV, PORTAL_SCANNER_TEST_MODE: 'live' })).kind === 'live');
const mock = resolveScanEndpoints(env({ SUPABASE_URL: DEV, PORTAL_SCANNER_TEST_MODE: 'mock' }));
assert('mock on a non-production project routes to this project\'s own mock function', mock.kind === 'mock' && mock.scanUrl === `${DEV}/functions/v1/${MOCK_FUNCTION_NAME}/virus/scan/file` && mock.advancedUrl.endsWith('/virus/scan/file/advanced'));
assert('mock mode is case-insensitive', resolveScanEndpoints(env({ SUPABASE_URL: DEV, PORTAL_SCANNER_TEST_MODE: ' MOCK ' })).kind === 'mock');

const prodMock = resolveScanEndpoints(env({ SUPABASE_URL: PROD, PORTAL_SCANNER_TEST_MODE: 'mock' }));
assert('PRODUCTION REFUSES mock mode (fails closed, never mocks, never falls back to live-pass)', prodMock.kind === 'forbidden' && /FORBIDDEN_IN_PRODUCTION/.test(prodMock.reason));
assert('production with the mode unset is plain live', resolveScanEndpoints(env({ SUPABASE_URL: PROD })).kind === 'live');
assert('production URL detected case-insensitively', resolveScanEndpoints(env({ SUPABASE_URL: PROD.toUpperCase(), PORTAL_SCANNER_TEST_MODE: 'mock' })).kind === 'forbidden');
assert('mock with no SUPABASE_URL is refused', resolveScanEndpoints(env({ PORTAL_SCANNER_TEST_MODE: 'mock' })).kind === 'forbidden');
assert('mock with a non-https URL is refused', resolveScanEndpoints(env({ SUPABASE_URL: 'http://localhost:54321', PORTAL_SCANNER_TEST_MODE: 'mock' })).kind === 'forbidden');
assert('mock with a malformed URL is refused', resolveScanEndpoints(env({ SUPABASE_URL: 'not a url', PORTAL_SCANNER_TEST_MODE: 'mock' })).kind === 'forbidden');
assert('unknown mode values are refused rather than treated as live', resolveScanEndpoints(env({ SUPABASE_URL: DEV, PORTAL_SCANNER_TEST_MODE: 'bypass' })).kind === 'forbidden');
assert('no configurable URL override exists: an extra URL variable is ignored', (() => { const r = resolveScanEndpoints(env({ SUPABASE_URL: DEV, PORTAL_SCANNER_TEST_MODE: 'mock', CLOUDMERSIVE_API_BASE_URL: 'https://evil.example' })); return r.kind === 'mock' && !r.scanUrl.includes('evil'); })());
report('scannerTestMode');
