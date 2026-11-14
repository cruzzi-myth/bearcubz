// Local preparation only. Does not connect to Supabase or change migration history.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = new URL('../migrations/', import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'signal-portal-k16h1-release-'));
mkdirSync(join(output, 'migrations'));
const manifest = [];
for (const file of readdirSync(source).filter(f => f.endsWith('.sql')).sort()) {
  const original = readFileSync(new URL(file, source), 'utf8');
  let prepared = original;
  const schedule = prepared.indexOf('select cron.schedule(');
  if (schedule !== -1) {
    // All four historical scheduler blocks are terminal statements.
    // Refuse a changed shape rather than silently discard later schema SQL.
    const tail = prepared.slice(schedule);
    if (!/^select cron\.schedule\([\s\S]*\$\$\s*\);\s*$/.test(tail)) throw new Error(`Review scheduler shape: ${file}`);
    prepared = prepared.slice(0, schedule) + '-- K1.6H.1: development scheduler omitted; production scheduling is a separate approval gate.\n';
  }
  if (/https:\/\/gcbonlvbgyhsgfayvlvz\.supabase\.co/.test(prepared)) throw new Error(`Development endpoint remains: ${file}`);
  writeFileSync(join(output, 'migrations', file), prepared);
  manifest.push({ file, sourceSha256: createHash('sha256').update(original).digest('hex'), preparedSha256: createHash('sha256').update(prepared).digest('hex'), schedulerOmitted: prepared !== original });
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(output, 'README.txt'), 'REVIEW ONLY. No deployment authorized. Historical source files remain unchanged. This prepared set requires migration-history reconciliation and explicit owner approval before any use. Do not run db push from the original checkout.\n');
console.log(output);
