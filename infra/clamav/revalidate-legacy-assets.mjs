// Stage K1.6H.3 — authorized local-only revalidation of the real,
// private legacy administrator assets (collaboration_assets rows with
// security_status='legacy_unverified'). This downloads the EXACT real
// private bytes from Supabase Storage directly into a local,
// restrictive-permission temp file, hashes them, scans them with the
// local ClamD daemon (loopback only — see infra/clamav/README.md for
// how to start one), deletes the temp file immediately, and prints
// only metadata and a verdict. The real bytes are never written
// anywhere but that one temp file, never logged, and never sent to
// Cloudmersive, VirusTotal, or any other third party — the K1.6H.3
// brief explicitly prohibits that without separate authorization.
//
// This is a TEST of the revalidation workflow, not a production
// activation: it does not write scan_evidence back to the database
// (the brief draws an explicit line between "local ClamAV can
// genuinely scan the exact bytes" and "production activation
// requires genuine security evidence for the exact PRODUCTION
// bytes" — these dev-stored bytes are not production bytes).
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CLAMD_PORT=33420 node revalidate-legacy-assets.mjs
// Resolved directly against portal-app's installed copy -- infra/clamav/
// has no package.json of its own declaring this npm dependency.
import { createClient } from '../../portal-app/node_modules/@supabase/supabase-js/dist/index.mjs';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { clamdCommand, parseVersion, parseVerdict } from './worker/clamd.mjs';

const port = Number(process.env.CLAMD_PORT ?? 3310);
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const engineBefore = parseVersion(await clamdCommand('VERSION', { port, timeoutMs: 3000 }));
console.log('Local ClamD engine:', JSON.stringify(engineBefore));

const { data: rows, error } = await admin
  .from('collaboration_assets')
  .select('id, collaboration_id, asset_type, storage_bucket, storage_path, byte_size, mime_type, is_active')
  .eq('security_status', 'legacy_unverified')
  .order('collaboration_id');
if (error) throw new Error(error.message);

const results = [];
for (const row of rows) {
  const download = await admin.storage.from(row.storage_bucket).download(row.storage_path);
  if (download.error) { results.push({ assetId: row.id, assetType: row.asset_type, error: 'DOWNLOAD_FAILED', detail: download.error.message }); continue; }
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sizeMatches = bytes.length === row.byte_size;

  const dir = await mkdtemp(join(tmpdir(), 'sp-legacy-revalidate-'));
  const file = join(dir, 'payload');
  try {
    await writeFile(file, bytes, { mode: 0o600 });
    await chmod(dir, 0o700);
    const raw = await clamdCommand('INSTREAM', { file, port, timeoutMs: 65_000 });
    const verdict = parseVerdict(raw);
    const engineAfter = parseVersion(await clamdCommand('VERSION', { port, timeoutMs: 3000 }));
    const signatureStable = JSON.stringify(engineBefore) === JSON.stringify(engineAfter);
    results.push({
      assetId: row.id, collaborationId: row.collaboration_id, assetType: row.asset_type, mimeType: row.mime_type,
      byteSize: bytes.length, expectedByteSize: row.byte_size, sizeMatches, sha256, isActive: row.is_active,
      verdict: verdict.verdict, complete: verdict.complete, withinLimits: verdict.withinLimits,
      engineVersion: engineAfter.engineVersion, signatureVersion: engineAfter.signatureVersion, signatureStable,
      scannedAt: new Date().toISOString(), attemptId: randomUUID(),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ scannedAt: new Date().toISOString(), engine: engineBefore, scope: 'Real private dev-stored legacy asset bytes; local ClamD only; never sent externally; test of the revalidation workflow, not a production activation', results }, null, 2));
