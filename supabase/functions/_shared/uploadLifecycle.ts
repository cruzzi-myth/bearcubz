// Pure upload-lifecycle decision logic extracted from
// portal-admin-confirm-upload — no Deno/Supabase APIs, so it can be
// unit-tested directly (see
// portal-app/tests/security/uploadLifecycle.test.mjs).
export type UploadStatus = 'pending' | 'uploading' | 'verifying' | 'ready' | 'failed';

export type ConfirmGuardResult =
  | { action: 'already-ready' }
  | { action: 'proceed' }
  | { action: 'reject'; error: 'INVALID_STATE' };

/** Confirm is only ever valid from pending/uploading/failed (retry).
 * 'ready' short-circuits as a no-op success (idempotent re-confirm).
 * Any other value (including 'verifying', which only this same call
 * sets) is rejected — confirm must never be called concurrently with
 * itself or on a state it doesn't recognize. */
export function guardConfirmUpload(currentStatus: UploadStatus | string): ConfirmGuardResult {
  if (currentStatus === 'ready') return { action: 'already-ready' };
  if (currentStatus === 'pending' || currentStatus === 'uploading' || currentStatus === 'failed') {
    return { action: 'proceed' };
  }
  return { action: 'reject', error: 'INVALID_STATE' };
}

export interface VerificationInput {
  primaryExists: boolean;
  primarySize: number | null | undefined;
  expectedByteSize: number | null | undefined;
  hasThumbnail: boolean;
  thumbnailExists: boolean;
}

export type VerificationFailureReason = 'OBJECT_NOT_FOUND' | 'SIZE_MISMATCH' | 'THUMBNAIL_MISSING';
export type VerificationResult = { ok: true } | { ok: false; reason: VerificationFailureReason };

/** Exact byte-size match required (Storage's reported size is exact,
 * not approximate — see the Stage I1 note in portal-admin-confirm-upload).
 * Missing expected/actual sizes are treated as "can't disprove," matching
 * the pre-hardening behavior for rows that predate byte_size tracking. */
export function evaluateUploadVerification(input: VerificationInput): VerificationResult {
  if (!input.primaryExists) return { ok: false, reason: 'OBJECT_NOT_FOUND' };

  const sizeOk =
    input.expectedByteSize == null || input.primarySize == null || input.primarySize === input.expectedByteSize;
  if (!sizeOk) return { ok: false, reason: 'SIZE_MISMATCH' };

  if (input.hasThumbnail && !input.thumbnailExists) return { ok: false, reason: 'THUMBNAIL_MISSING' };

  return { ok: true };
}
