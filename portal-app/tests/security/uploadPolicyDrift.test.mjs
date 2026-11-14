// Stage K1.6G section 5 — "Ensure client and server limits cannot
// drift silently." The frontend (attachmentRules.ts) and the backend
// (uploadPolicy.ts, a Deno Edge Function module) have no shared
// module between them to enforce this at the type level, so this
// test is the actual enforcement: it imports both files' literal
// default values directly and asserts they match exactly. If either
// default is ever changed without the other, this test fails.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, report } from './runner.mjs';

function importBundled(absoluteTsPath) {
  const js = execFileSync('npx', ['--yes', 'esbuild', absoluteTsPath, '--bundle', '--platform=neutral', '--format=esm'], { encoding: 'utf8' });
  const dir = mkdtempSync(join(tmpdir(), 'sp-test-'));
  const outFile = join(dir, 'module.mjs');
  writeFileSync(outFile, js);
  return import(pathToFileURL(outFile).href);
}

const backend = await importBundled(new URL('../../../supabase/functions/_shared/uploadPolicy.ts', import.meta.url).pathname);
const frontend = await importBundled(new URL('../../src/lib/attachmentRules.ts', import.meta.url).pathname);

assert(
  'the frontend ARTIST_UPLOAD_MAX_BYTES default and the backend ARTIST_UPLOAD_MAX_BYTES_DEFAULT are numerically identical',
  frontend.ARTIST_UPLOAD_MAX_BYTES === backend.ARTIST_UPLOAD_MAX_BYTES_DEFAULT,
);
assert('both sides default to the real, confirmed Cloudmersive free-tier-safe threshold (2,900,000 bytes)', backend.ARTIST_UPLOAD_MAX_BYTES_DEFAULT === 2_900_000);

report('uploadPolicyDrift (Stage K1.6G section 5 — frontend/backend launch-limit must never silently diverge)');
