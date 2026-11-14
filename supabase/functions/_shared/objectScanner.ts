import { createHash } from 'node:crypto';
import { scannerConfig, routeScanner } from './scannerPolicy.ts';
import { cloudmersiveScanner, clamavScanner, failedEvidence, type ScanEvidence, type ScanInput } from './scannerProvider.ts';
import { verifyFileSignature } from './attachmentSafety.ts';
import { validateZipArchive } from './zipValidation.ts';

// SupabaseClient remains the same trusted service client used by the existing orchestrator.
export async function scanStoredObject(client: any, kind: 'attachment' | 'asset', row: any, attemptId: string): Promise<ScanEvidence> {
  let input: ScanInput = { attemptId, fileSha256: '', fileSize: row.byte_size, mimeType: row.mime_type, filename: row.storage_path.split('/').pop() ?? 'upload' };
  let config;
  try { config = scannerConfig(); } catch { return failedEvidence(input, 'INVALID_SCANNER_CONFIG'); }
  const provider = routeScanner(row.byte_size, config);
  if (provider === 'clamav' && row.object_variant === 'thumbnail') return failedEvidence(input, 'THUMBNAIL_WORKER_NOT_SUPPORTED', 'unsupported');
  if (provider === 'unsupported') return failedEvidence(input, 'EXCEEDS_SCANNER_SIZE_LIMIT', 'unsupported');
  const signed = await client.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 120);
  if (signed.error || !signed.data) return failedEvidence(input, 'DOWNLOAD_FAILED');
  const buffered: Uint8Array[] = [];
  const hasher = createHash('sha256'); let size = 0; let header = new Uint8Array();
  try {
    const response = await fetch(signed.data.signedUrl, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !response.body) return failedEvidence(input, 'DOWNLOAD_FAILED');
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > row.byte_size || size > config.clamavMaxBytes) throw new Error('SIZE_MISMATCH');
      hasher.update(chunk);
      if (header.length < 16) header = new Uint8Array([...header, ...chunk.slice(0, 16 - header.length)]);
      if (provider === 'cloudmersive') buffered.push(chunk);
    }
    if (size !== row.byte_size) return failedEvidence(input, 'SIZE_MISMATCH');
    input = { ...input, fileSha256: hasher.digest('hex') };
    if (!verifyFileSignature(row.mime_type, header)) return failedEvidence(input, 'SIGNATURE_MISMATCH');
    if (provider === 'cloudmersive') {
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of buffered) { bytes.set(chunk, offset); offset += chunk.length; }
      if (row.mime_type === 'application/zip') {
        const zip = validateZipArchive(bytes); if (!zip.ok) return failedEvidence(input, zip.reason!, 'unsupported');
      }
      return await cloudmersiveScanner(bytes, { maxFileSizeBytes: config.cloudmersiveMaxBytes }).scan(input);
    }
    // Pin trusted checksum before issuing a worker capability. Never use a browser checksum as clearance.
    const table = kind === 'asset' ? 'collaboration_assets' : 'collaboration_feedback_attachments';
    const pinned = await client.from(table).update({ file_sha256: input.fileSha256 }).eq('id', row.id).eq('scan_request_id', attemptId).select('id').maybeSingle();
    if (!pinned.data) return failedEvidence(input, 'STALE_ATTEMPT');
    return await clamavScanner(kind, row.id).scan(input);
  } catch { return failedEvidence(input, 'DOWNLOAD_OR_SIZE_ERROR'); }
}
