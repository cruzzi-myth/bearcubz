import { createConnection } from 'node:net';
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { isSupportedClamavVersion } from '../../../supabase/functions/_shared/clamavPolicy.ts';

export function parseVersion(text, now = Date.now()) {
  const m = /^ClamAV ([^/]+)\/(\d+)\/(.+)$/.exec(text.trim());
  const date = m ? Date.parse(m[3] + (/GMT|UTC|[+-]\d{4}/.test(m[3]) ? '' : ' UTC')) : NaN;
  if (!m || !isSupportedClamavVersion(m[1]) || !Number.isFinite(date) || date > now + 60_000 || now - date > 48 * 3600_000) throw new Error('STALE_OR_UNSUPPORTED_ENGINE');
  return { engineVersion: m[1], signatureVersion: m[2], signatureTimestamp: new Date(date).toISOString() };
}
export function parseVerdict(reply) {
  const text = reply.replace(/\0/g, '').trim();
  if (text === 'stream: OK') return { verdict: 'clean', complete: false, withinLimits: false, errorCategory: 'COVERAGE_NOT_ESTABLISHED', detail: null };
  if (/Heuristics\.(Limits|Encrypted|Broken)|limit|timeout|skipped|error|unsupported/i.test(text)) return { verdict: 'incomplete', complete: false, withinLimits: false, errorCategory: 'CLAMAV_INCOMPLETE', detail: 'CLAMAV_INCOMPLETE' };
  if (/^stream: .+ FOUND$/.test(text)) return { verdict: 'infected', complete: true, withinLimits: true, errorCategory: null, detail: 'CLAMAV_THREAT_DETECTED' };
  return { verdict: 'error', complete: false, withinLimits: false, errorCategory: 'INVALID_CLAMD_RESPONSE', detail: 'INVALID_CLAMD_RESPONSE' };
}
export async function clamdCommand(command, { host = process.env.CLAMD_HOST ?? '127.0.0.1', port = Number(process.env.CLAMD_PORT ?? 3310), file, timeoutMs = 65_000 } = {}) {
  const socket = createConnection({ host, port });
  // Bound the whole operation, including streaming, rather than only idle periods.
  const deadline = setTimeout(() => socket.destroy(new Error('SCAN_TIMEOUT')), timeoutMs);
  deadline.unref();
  let reply = ''; let settled = false;
  const result = new Promise((resolve, reject) => {
    socket.on('data', data => {
      reply += data.toString('utf8');
      if (reply.length > 4096) socket.destroy(new Error('INVALID_CLAMD_RESPONSE'));
      if (reply.includes('\0')) { settled = true; resolve(reply.replace(/\0.*$/s, '').trim()); socket.end(); }
    });
    socket.on('error', reject);
    socket.on('close', () => { if (!settled) reject(new Error('INTERRUPTED_SCAN')); });
  });
  // Attach immediately so connect/write errors cannot become unhandled rejections.
  result.catch(() => {});
  const write = data => new Promise((resolve, reject) => {
    socket.write(data, error => error ? reject(error) : resolve());
  });
  try {
    await once(socket, 'connect');
    await write(`z${command}\0`);
    if (file) {
      for await (const chunk of createReadStream(file, { highWaterMark: 64 * 1024 })) {
        if (settled) return await result; // ClamD can reject oversized streams early.
        if (socket.destroyed) throw new Error('INTERRUPTED_SCAN');
        const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length);
        await write(size);
        await write(chunk);
      }
      if (!settled) await write(Buffer.alloc(4));
    }
    return await result;
  } catch (error) {
    if (settled) return await result;
    throw error;
  } finally { clearTimeout(deadline); socket.destroy(); }
}
