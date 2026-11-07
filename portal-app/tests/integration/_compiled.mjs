// Loads the real classifyAuthorization() from the app's own source
// (not a reimplementation) for use against real integration data.
// Node's native TS type-stripping (--experimental-strip-types) cannot
// resolve portalAuthorization.ts's extensionless relative import of
// ../../lib/supabaseErrors on its own — confirmed by direct test, not
// assumed — so this recreates the real relative layout under a temp
// dir via esbuild, the same approach already proven in
// tests/security/portalAuthorization.test.mjs (10/10 passed there).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const srcRoot = new URL('../../src/', import.meta.url).pathname;

export async function loadClassifyAuthorization() {
  const dir = mkdtempSync(join(tmpdir(), 'sp-integration-authz-'));
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

  const mod = await import(pathToFileURL(join(dir, 'features', 'auth', 'portalAuthorization.js')).href);
  return mod.classifyAuthorization;
}
