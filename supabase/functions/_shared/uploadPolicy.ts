import { scannerConfig } from './scannerPolicy.ts';
// Stage K1.6G section 5 — the launch-time artist upload policy. This
// is a SEPARATE, ADDITIONAL cap layered on top of (never replacing)
// each category's own existing limit in portal-request-attachment-
// upload-url's CATEGORY_RULES — those stay exactly as they are
// (document 25MB, image 15MB, audio 100MB, zip 25MB), ready to use
// immediately the moment a future paid Cloudmersive plan removes the
// scanner constraint. This file is the ONE place the launch-time
// number is read, so the effective limit can never drift between two
// independently-hardcoded copies on the backend.
//
// "Read the effective configured value rather than hard-coding a new
// limit" (K1.6G section 5): this reads the SAME CLOUDMERSIVE_MAX_FILE_SIZE_BYTES
// env var malwareScan.ts already reads (see that file's own default,
// 2,900,000) as its first fallback, rather than inventing a third,
// independent hardcoded number — an operator who raises the scanner
// threshold raises this too, automatically, unless PORTAL_ARTIST_UPLOAD_MAX_BYTES
// is explicitly set to something different on purpose.
const FALLBACK_MAX_BYTES = 2_900_000;

export function getArtistUploadMaxBytes(): number {
  const value = scannerConfig().artistMaxBytes;
  // Larger policy requires a separately verified release; code installation alone never raises it.
  if (!Number.isSafeInteger(value) || value < 1 || value > FALLBACK_MAX_BYTES) throw new Error('INVALID_ARTIST_UPLOAD_POLICY');
  return value;
}

// Exported so the one cross-runtime drift test
// (tests/security/uploadPolicyDrift.test.mjs) can assert this literal
// number is identical to the frontend's own literal copy
// (ARTIST_UPLOAD_MAX_BYTES in src/lib/attachmentRules.ts) without
// needing a shared module between a Deno Edge Function and a Vite
// frontend bundle, which don't share one today.
export const ARTIST_UPLOAD_MAX_BYTES_DEFAULT = FALLBACK_MAX_BYTES;
