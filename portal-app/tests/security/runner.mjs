// Minimal, dependency-free test harness. No vitest/jest was added —
// portal-app has no test runner today (unlike network-app, which has
// vitest), and adding one just for this would be exactly the
// "unnecessary dependency" the Stage I1 brief asked to avoid.
// esbuild is already resolvable (vite depends on it) and is enough to
// transpile the handful of pure-logic TS modules these tests need.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let totalFailures = 0;
let totalPassed = 0;

export function assert(name, condition) {
  if (condition) {
    totalPassed += 1;
    console.log('PASS', name);
  } else {
    totalFailures += 1;
    console.log('FAIL', name);
  }
}

/** Transpiles a TS source file (no bundling — only the file's own
 * code, so it must not import anything beyond what's passed here or
 * plain relative siblings already compiled) and returns the
 * imported module's exports. */
export function importCompiled(absoluteTsPath) {
  const js = execFileSync('npx', ['--yes', 'esbuild', absoluteTsPath, '--bundle=false', '--format=esm'], {
    encoding: 'utf8',
  });
  const dir = mkdtempSync(join(tmpdir(), 'sp-test-'));
  const outFile = join(dir, 'module.mjs');
  writeFileSync(outFile, js);
  return import(pathToFileURL(outFile).href);
}

export function report(label) {
  console.log(`\n${label}: ${totalPassed} passed, ${totalFailures} failed`);
  if (totalFailures > 0) process.exitCode = 1;
}
