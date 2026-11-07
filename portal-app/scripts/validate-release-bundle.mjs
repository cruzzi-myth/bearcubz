#!/usr/bin/env node
// Stage I3A: static, after-the-fact proof that a production build's
// actual output is safe to deploy — independent of (not a substitute
// for) vite.config.ts's build-time guard. That guard checks the
// SOURCE env vars before building; this script checks the COMPILED
// output itself, by reading the real files that would be deployed,
// the same way Stage I3's audit first discovered the original defect
// (by inspecting the actual bundle, not by reviewing source).
//
// Usage: node scripts/validate-release-bundle.mjs
// Exits non-zero (and prints exactly what failed) if any check fails.
// Never prints a full secret value — only redacted fragments, per the
// Stage I3A brief's explicit "never print secret values" requirement.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PRODUCTION_REF = 'drsidtagxezznqviupsr';
const FORBIDDEN_REFS = ['gcbonlvbgyhsgfayvlvz']; // signal-portal-dev
const BUILD_DIR = join(import.meta.dirname, '..', '..', 'portal');

let failed = false;
function check(name, ok, detail) {
  if (ok) {
    console.log('PASS', name);
  } else {
    failed = true;
    console.log('FAIL', name, detail ? `— ${detail}` : '');
  }
}

if (!existsSync(BUILD_DIR)) {
  console.error(`No build output found at ${BUILD_DIR} — run \`npm run build\` first.`);
  process.exit(1);
}

const assetsDir = join(BUILD_DIR, 'assets');
const jsFiles = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith('.js')) : [];
check('at least one JS bundle exists in the build output', jsFiles.length > 0, `found ${jsFiles.length} in ${assetsDir}`);

const bundleText = jsFiles.map((f) => readFileSync(join(assetsDir, f), 'utf8')).join('\n');
const indexHtml = readFileSync(join(BUILD_DIR, 'index.html'), 'utf8');

check('production project reference is present in the compiled bundle', bundleText.includes(PRODUCTION_REF));

for (const ref of FORBIDDEN_REFS) {
  check(`development project reference (${ref}) is absent from the compiled bundle`, !bundleText.includes(ref));
}

// Scan every JWT-shaped token in the bundle (base64url.base64url.sig)
// and decode its payload to check the embedded role — this is a real
// decode, not a guess, and it never prints the token itself, only the
// role it claims and a short, non-reversible fragment for correlation.
function base64UrlDecode(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

const jwtPattern = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const foundTokens = [...new Set(bundleText.match(jwtPattern) ?? [])];
let serviceRoleFound = false;
for (const token of foundTokens) {
  const payloadSegment = token.split('.')[1];
  try {
    const payload = JSON.parse(base64UrlDecode(payloadSegment));
    if (payload.role === 'service_role') {
      serviceRoleFound = true;
      console.log(`  (a service_role-claiming token was found — fragment for correlation only: ${token.slice(0, 12)}…, never printed in full)`);
    }
  } catch {
    // Not a valid JSON payload — not a Supabase-style JWT, ignore.
  }
}
check(`no embedded token claims role=service_role (${foundTokens.length} JWT-shaped token(s) scanned)`, !serviceRoleFound);

check('/portal/ base path is present in the built index.html', /\/portal\/assets\//.test(indexHtml));
// Note: a generic "no literal 'localhost' anywhere in the bundle"
// check was tried and removed — @supabase/auth-js's own vendored
// source always contains such strings (a default placeholder URL,
// CORS-allowlist literals), making that check fail on every build
// regardless of configuration. The project-ref checks above are the
// precise, correct way to confirm no development URL is embedded.

console.log();
if (failed) {
  console.log('Release validation: FAILED — do not deploy this build.');
  process.exit(1);
} else {
  console.log('Release validation: PASSED.');
}
