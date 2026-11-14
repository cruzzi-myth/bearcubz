import { isSupportedClamavVersion, CLAMAV_VERIFICATION_VERSION } from './clamavPolicy.ts';
import { scanFileForMalware, type ScanOptions } from './malwareScan.ts';
import { scannerConfig, routeScanner } from './scannerPolicy.ts';
export type ScanVerdict = 'clean' | 'infected' | 'unsupported' | 'incomplete' | 'error';
export type ScanInput = { attemptId: string; fileSha256: string; fileSize: number; mimeType: string; filename: string };
export type ScanEvidence = ScanInput & {
  verificationVersion?: string; archiveEntryCount?: number; archiveEntriesScanned?: number; archiveExpandedBytes?: number;
  provider: string; verdict: ScanVerdict; engineVersion: string | null; signatureVersion: string | null;
  signatureTimestamp: string | null; startedAt: string; completedAt: string; complete: boolean;
  withinLimits: boolean; errorCategory: string | null; detail: string | null; policyVersion: string; workerId: string | null;
};
export interface MalwareScanner { provider: 'cloudmersive' | 'clamav'; scan(input: ScanInput): Promise<ScanEvidence>; }
export const POLICY_VERSION = 'signal-portal-k16h2-v1';
export async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer)), b => b.toString(16).padStart(2, '0')).join('');
}
export function failedEvidence(input: ScanInput, detail: string, verdict: ScanVerdict = 'error', provider = 'none'): ScanEvidence {
  const now = new Date().toISOString();
  return { ...input, provider, verdict, engineVersion: null, signatureVersion: null, signatureTimestamp: null, startedAt: now, completedAt: now, complete: false, withinLimits: false, errorCategory: detail, detail, policyVersion: POLICY_VERSION, workerId: null };
}
export async function scanBytes(input: ScanInput, bytes: Uint8Array, options: ScanOptions = {}): Promise<ScanEvidence> {
  if (bytes.length !== input.fileSize || await sha256(bytes) !== input.fileSha256) return failedEvidence(input, 'CHECKSUM_MISMATCH');
  let config;
  try { config = scannerConfig(); } catch { return failedEvidence(input, 'INVALID_SCANNER_CONFIG'); }
  if (routeScanner(input.fileSize, config) !== 'cloudmersive') return failedEvidence(input, 'EXCEEDS_SCANNER_SIZE_LIMIT', 'unsupported');
  const startedAt = new Date().toISOString();
  // Preserve Cloudmersive's API and local EICAR rejection semantics. Local rejection is never engine evidence.
  const result = await scanFileForMalware(bytes, input.filename, input.mimeType, { ...options, maxFileSizeBytes: Math.min(options.maxFileSizeBytes ?? config.cloudmersiveMaxBytes, config.cloudmersiveMaxBytes) });
  if (result.verdict === 'error' && result.detail) result.detail = result.detail.split(':')[0];
  const complete = ['cloudmersive', 'cloudmersive-advanced'].includes(result.provider) && ['clean', 'infected'].includes(result.verdict);
  return { ...failedEvidence(input, result.detail ?? 'SCAN_ERROR'), ...result, startedAt, completedAt: new Date().toISOString(), complete, withinLimits: complete, errorCategory: result.verdict === 'error' ? result.detail : null };
}
export function validWorkerResult(value: unknown, input: ScanInput): value is ScanEvidence {
  if (!value || typeof value !== 'object') return false;
  const r = value as ScanEvidence;
  const start = Date.parse(r.startedAt), end = Date.parse(r.completedAt), signature = Date.parse(r.signatureTimestamp ?? '');
  const zipComplete = !['application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(input.mimeType) || (Number.isSafeInteger(r.archiveEntryCount) && r.archiveEntryCount! >= 0 && r.archiveEntryCount! <= 100 && r.archiveEntriesScanned === r.archiveEntryCount && Number.isSafeInteger(r.archiveExpandedBytes) && r.archiveExpandedBytes! >= 0 && r.archiveExpandedBytes! <= 100 * 1024 * 1024);
  return r.verificationVersion === CLAMAV_VERIFICATION_VERSION && (r.verdict !== 'clean' || zipComplete) && r.provider === 'clamav' && r.attemptId === input.attemptId && r.fileSha256 === input.fileSha256 && r.fileSize === input.fileSize && r.mimeType === input.mimeType && r.policyVersion === POLICY_VERSION && typeof r.workerId === 'string' && r.workerId.length > 0 && isSupportedClamavVersion(r.engineVersion) && typeof r.signatureVersion === 'string' && /^\d+$/.test(r.signatureVersion) && Number.isFinite(signature) && signature <= Date.now() + 60_000 && Date.now() - signature <= 48 * 3600_000 && Number.isFinite(start) && Number.isFinite(end) && start <= end && end <= Date.now() + 60_000 && Date.now() - end < 180_000 && ['clean', 'infected', 'unsupported', 'incomplete', 'error'].includes(r.verdict) && (r.verdict !== 'clean' || (r.complete === true && r.withinLimits === true));
}
export async function scanWithWorker(input: ScanInput, objectKind: 'attachment' | 'asset', objectId: string): Promise<ScanEvidence> {
  let config;
  try { config = scannerConfig(); } catch { return failedEvidence(input, 'INVALID_SCANNER_CONFIG'); }
  if (routeScanner(input.fileSize, config) !== 'clamav') return failedEvidence(input, 'EXCEEDS_SCANNER_SIZE_LIMIT', 'unsupported');
  try {
    const res = await fetch(new URL('scan', config.workerUrl!), { method: 'POST', headers: { Authorization: `Bearer ${config.workerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ objectKind, objectId, attemptId: input.attemptId }), signal: AbortSignal.timeout(105_000), redirect: 'error' });
    if (!res.ok) return failedEvidence(input, res.status === 429 ? 'HTTP_429_RATE_LIMITED' : 'WORKER_UNAVAILABLE', 'error', 'clamav');
    const value = await res.json();
    if (!validWorkerResult(value, input)) return failedEvidence(input, 'INVALID_WORKER_RESPONSE', 'incomplete', 'clamav');
    return value;
  } catch { return failedEvidence(input, 'WORKER_UNAVAILABLE', 'error', 'clamav'); }
}

export function cloudmersiveScanner(bytes: Uint8Array, options: ScanOptions = {}): MalwareScanner {
  return { provider: 'cloudmersive', scan: input => scanBytes(input, bytes, options) };
}
export function clamavScanner(kind: 'attachment' | 'asset', objectId: string): MalwareScanner {
  return { provider: 'clamav', scan: input => scanWithWorker(input, kind, objectId) };
}
