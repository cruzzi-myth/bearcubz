import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, readdir, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CLAMAV_VERIFICATION_VERSION } from '../../../supabase/functions/_shared/clamavPolicy.ts';
import { daemonPolicy } from './daemon-policy.mjs';
import { parseVersion, parseVerdict, clamdCommand } from './clamd.mjs';
import { verifyFileSignature } from '../../../supabase/functions/_shared/attachmentSafety.ts';
import { validateZipArchive } from '../../../supabase/functions/_shared/zipValidation.ts';
const run = promisify(execFile);
const POLICY = 'signal-portal-k16h2-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 100 * 1024 * 1024;
const ROOT = process.env.SCANNER_TMP_DIR ?? '/tmp/signal-portal-scans';
export function authorized(header, token) {
  if (!token || token.length < 32 || typeof header !== 'string') return false;
  const a = createHash('sha256').update(header).digest(), b = createHash('sha256').update(`Bearer ${token}`).digest();
  return timingSafeEqual(a, b);
}
export function validJob(job) { return job && ['asset','attachment'].includes(job.objectKind) && UUID.test(job.objectId) && UUID.test(job.attemptId) && Object.keys(job).length === 3; }
export function validateCapability(cap, job, projectUrl) {
  const u = new URL(cap.url), p = new URL(projectUrl);
  if (u.origin !== p.origin || u.protocol !== 'https:' || !u.pathname.startsWith('/storage/v1/object/sign/') || u.username || u.password || cap.attemptId !== job.attemptId || !Number.isSafeInteger(cap.fileSize) || cap.fileSize < 1 || cap.fileSize > MAX_BYTES || !/^[a-f0-9]{64}$/.test(cap.fileSha256) || typeof cap.mimeType !== 'string' || !Number.isFinite(Date.parse(cap.leaseExpiresAt)) || Date.parse(cap.leaseExpiresAt) < Date.now() + 90_000) throw new Error('INVALID_CAPABILITY');
  return cap;
}
export async function privateTempRoot(root = ROOT) {
  await mkdir(root, { recursive: true, mode: 0o700 }); await chmod(root, 0o700);
  // Single-worker startup only. No persistent object mount; remove interrupted jobs.
  for (const name of await readdir(root)) if (/^job-[a-zA-Z0-9]+$/.test(name)) await rm(join(root, name), { recursive: true, force: true });
}
export async function executeJob(job, config, { command = clamdCommand, fetcher = fetch } = {}) {
  const startedAt = new Date().toISOString();
  let directory; let cap;
  try {
    await daemonPolicy();
    const versionBefore = parseVersion(await command('VERSION'));
    const broker = await fetcher(new URL('/functions/v1/portal-scanner-worker-access', config.projectUrl), { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(job), signal: AbortSignal.timeout(10_000) });
    if (!broker.ok) throw new Error('JOB_NOT_ELIGIBLE');
    cap = validateCapability(await broker.json(), job, config.projectUrl);
    directory = await mkdtemp(join(config.tmpRoot ?? ROOT, 'job-')); await chmod(directory, 0o700);
    const file = join(directory, 'payload'); const handle = await open(file, 'wx', 0o600);
    const hash = createHash('sha256'); let length = 0; let prefix = Buffer.alloc(0);
    try {
      const response = await fetcher(cap.url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok || !response.body) throw new Error('DOWNLOAD_FAILED');
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > cap.fileSize || length > MAX_BYTES) throw new Error('SIZE_MISMATCH');
        hash.update(chunk); if (prefix.length < 16) prefix = Buffer.concat([prefix, Buffer.from(chunk).subarray(0, 16 - prefix.length)]);
        let offset = 0;
        while (offset < chunk.length) { const result = await handle.write(chunk, offset, chunk.length - offset); offset += result.bytesWritten; }
      }
    } finally { await handle.close(); }
    if (length !== cap.fileSize || hash.digest('hex') !== cap.fileSha256) throw new Error('CHECKSUM_MISMATCH');
    if (!verifyFileSignature(cap.mimeType, prefix)) throw new Error('SIGNATURE_MISMATCH');
    let archiveProof = null;
    if (['application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(cap.mimeType)) {
      if (length > 25 * 1024 * 1024) throw new Error('ZIP_SIZE_LIMIT');
      const metadata = validateZipArchive(await readFile(file));
      if (!metadata.ok) throw new Error(metadata.reason);
      const entryRoot = join(directory, 'entries');
      const check = await run('python3', [fileURLToPath(new URL('verify_zip.py', import.meta.url)), file, entryRoot], { timeout: 12_000, maxBuffer: 65536 });
      const verified = JSON.parse(check.stdout);
      if (!verified.complete || verified.entryCount !== metadata.entryCount || verified.expandedBytes !== metadata.totalDeclaredUncompressedBytes || verified.entries.length !== verified.entryCount) throw new Error('ZIP_INCOMPLETE');
      archiveProof = { archiveEntryCount: verified.entryCount, archiveEntriesScanned: 0, archiveExpandedBytes: verified.expandedBytes };
      for (const entry of verified.entries) {
        if (!/^entry-\d{4}$/.test(entry.name)) throw new Error('ZIP_INCOMPLETE');
        const verdict = parseVerdict(await command('INSTREAM', { file: join(entryRoot, entry.name) }));
        archiveProof.archiveEntriesScanned++;
        if (verdict.verdict !== 'clean') {
          const versionAfter = parseVersion(await command('VERSION'));
          if (JSON.stringify(versionBefore) !== JSON.stringify(versionAfter)) throw new Error('SIGNATURE_CHANGED_DURING_SCAN');
          return { attemptId: job.attemptId, fileSha256: cap.fileSha256, fileSize: cap.fileSize, mimeType: cap.mimeType, filename: 'private-object', provider: 'clamav', ...verdict, complete: false, ...versionAfter, ...archiveProof, verificationVersion: CLAMAV_VERIFICATION_VERSION, startedAt, completedAt: new Date().toISOString(), workerId: config.workerId, policyVersion: POLICY };
        }
      }
    }
    const result = parseVerdict(await command('INSTREAM', { file }));
    await daemonPolicy();
    const versionAfter = parseVersion(await command('VERSION'));
    if (JSON.stringify(versionBefore) !== JSON.stringify(versionAfter)) throw new Error('SIGNATURE_CHANGED_DURING_SCAN');
    if (result.verdict === 'clean') { result.complete = true; result.withinLimits = true; result.errorCategory = null; }
    return { attemptId: job.attemptId, fileSha256: cap.fileSha256, fileSize: cap.fileSize, mimeType: cap.mimeType, filename: 'private-object', provider: 'clamav', ...result, ...versionAfter, ...(archiveProof ?? {}), verificationVersion: CLAMAV_VERIFICATION_VERSION, startedAt, completedAt: new Date().toISOString(), workerId: config.workerId, policyVersion: POLICY };
  } finally { if (directory) await rm(directory, { recursive: true, force: true }); }
}
export function makeServer(config) {
  let active = false;
  return createServer({ requestTimeout: 110_000, headersTimeout: 10_000 }, async (req, res) => {
    const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (!authorized(req.headers.authorization, config.token)) return send(403, { error: 'NOT_AUTHORIZED' });
    if (req.url === '/health' && req.method === 'GET') {
      try { await daemonPolicy(); return send(200, { provider: 'clamav', healthy: !active, ...parseVersion(await clamdCommand('VERSION', { timeoutMs: 2000 })), maxBytes: MAX_BYTES, policyVersion: POLICY }); }
      catch { return send(503, { healthy: false }); }
    }
    if (req.url !== '/scan' || req.method !== 'POST') return send(404, { error: 'NOT_FOUND' });
    if (active) return send(429, { error: 'BUSY' });
    active = true;
    let job;
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 2048) throw new Error('INVALID_JOB'); }
      job = JSON.parse(body); if (!validJob(job)) throw new Error('INVALID_JOB');
      const result = await executeJob(job, config);
      console.log(JSON.stringify({ event: 'scan', attemptId: job.attemptId, verdict: result.verdict, bytes: result.fileSize }));
      return send(200, result);
    } catch {
      // Never echo private paths, tokens, URLs, raw scanner errors or request content.
      console.log(JSON.stringify({ event: 'scan_failed', attemptId: UUID.test(job?.attemptId ?? '') ? job.attemptId : null }));
      return send(503, { error: 'SCAN_INCOMPLETE' });
    } finally { active = false; }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = { token: process.env.PORTAL_SCANNER_WORKER_TOKEN, projectUrl: process.env.SUPABASE_URL, workerId: process.env.SCANNER_WORKER_ID ?? 'local-clamav-1' };
  if (!config.token || config.token.length < 32 || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.projectUrl ?? '')) throw new Error('INVALID_WORKER_CONFIG');
  await privateTempRoot();
  const server = makeServer(config); server.listen(8080, process.env.WORKER_BIND_HOST ?? '127.0.0.1');
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { server.close(); setTimeout(() => process.exit(1), 110_000).unref(); });
}
