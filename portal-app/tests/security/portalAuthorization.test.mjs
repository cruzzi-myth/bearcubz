import { assert, report } from './runner.mjs';

// portalAuthorization.ts has a relative import to ../../lib/supabaseErrors,
// so (like portalHostActions.test.mjs) this test recreates the two files'
// real relative layout under a temp dir rather than using importCompiled's
// single-file mode.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const srcRoot = new URL('../../src/', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'sp-authz-test-'));
mkdirSync(join(dir, 'features', 'auth'), { recursive: true });
mkdirSync(join(dir, 'lib'), { recursive: true });

function compile(relPath) {
  return execFileSync('npx', ['--yes', 'esbuild', join(srcRoot, relPath), '--bundle=false', '--format=esm'], { encoding: 'utf8' });
}

writeFileSync(join(dir, 'lib', 'supabaseErrors.js'), compile('lib/supabaseErrors.ts'));

const authzJs = compile('features/auth/portalAuthorization.ts').replace(
  /from\s+(['"])\.\.\/\.\.\/lib\/supabaseErrors\1/,
  'from $1../../lib/supabaseErrors.js$1',
);
writeFileSync(join(dir, 'features', 'auth', 'portalAuthorization.js'), authzJs);

const { classifyAuthorization } = await import(pathToFileURL(join(dir, 'features', 'auth', 'portalAuthorization.js')).href);

const backendGone = { code: '42P01', message: 'relation does not exist' };
const rlsDenied = { code: '42501', message: 'permission denied' };

assert(
  'missing-table error on memberships -> backend-unavailable (never confused with not-authorized)',
  classifyAuthorization({ membershipsError: backendGone, adminCheckError: null, adminStatus: false, memberships: [] }) === 'backend-unavailable',
);
assert(
  'missing-function error on admin check -> backend-unavailable',
  classifyAuthorization({ membershipsError: null, adminCheckError: backendGone, adminStatus: false, memberships: [] }) === 'backend-unavailable',
);
assert(
  'a genuine non-missing-table error -> error, never silently resolved to not-authorized',
  classifyAuthorization({ membershipsError: rlsDenied, adminCheckError: null, adminStatus: false, memberships: [] }) === 'error',
);
assert(
  'admin error path also -> error, not swallowed',
  classifyAuthorization({ membershipsError: null, adminCheckError: rlsDenied, adminStatus: false, memberships: [] }) === 'error',
);
assert(
  'admin flag true -> authorized, even with zero membership rows',
  classifyAuthorization({ membershipsError: null, adminCheckError: null, adminStatus: true, memberships: [] }) === 'authorized',
);
assert(
  'at least one active membership row -> authorized',
  classifyAuthorization({ membershipsError: null, adminCheckError: null, adminStatus: false, memberships: [{ status: 'active' }] }) === 'authorized',
);
assert(
  'membership rows exist but none active -> revoked, distinct from never-invited',
  classifyAuthorization({ membershipsError: null, adminCheckError: null, adminStatus: false, memberships: [{ status: 'revoked' }] }) === 'revoked',
);
assert(
  'mixed active + revoked rows -> authorized (any active membership is enough)',
  classifyAuthorization({ membershipsError: null, adminCheckError: null, adminStatus: false, memberships: [{ status: 'revoked' }, { status: 'active' }] }) === 'authorized',
);
assert(
  'zero membership rows, not admin -> not-authorized',
  classifyAuthorization({ membershipsError: null, adminCheckError: null, adminStatus: false, memberships: [] }) === 'not-authorized',
);
assert(
  'backend-unavailable takes priority over a real error on the other query',
  classifyAuthorization({ membershipsError: backendGone, adminCheckError: rlsDenied, adminStatus: false, memberships: [] }) === 'backend-unavailable',
);

report('portalAuthorization (authorization-state classification)');
