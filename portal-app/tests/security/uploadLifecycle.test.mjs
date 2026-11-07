import { assert, importCompiled, report } from './runner.mjs';

const mod = await importCompiled(
  new URL('../../../supabase/functions/_shared/uploadLifecycle.ts', import.meta.url).pathname,
);
const { guardConfirmUpload, evaluateUploadVerification } = mod;

// --- state-transition guard ---
assert('pending -> proceed (first confirm attempt)', guardConfirmUpload('pending').action === 'proceed');
assert('uploading -> proceed', guardConfirmUpload('uploading').action === 'proceed');
assert('failed -> proceed (retry is allowed)', guardConfirmUpload('failed').action === 'proceed');
assert('ready -> already-ready (idempotent re-confirm, not an error)', guardConfirmUpload('ready').action === 'already-ready');
assert('verifying -> reject (no concurrent confirm on itself)', guardConfirmUpload('verifying').action === 'reject');
assert('an unrecognized status string -> reject, never silently proceeds', guardConfirmUpload('bogus').action === 'reject');
assert('reject carries INVALID_STATE as its error code', guardConfirmUpload('verifying').error === 'INVALID_STATE');

// --- verification outcome ---
const base = { primaryExists: true, primarySize: 1000, expectedByteSize: 1000, hasThumbnail: false, thumbnailExists: false };

assert('object present, size matches exactly, no thumbnail required -> ok', evaluateUploadVerification(base).ok === true);
assert('object missing -> OBJECT_NOT_FOUND (checked before size)', evaluateUploadVerification({ ...base, primaryExists: false }).reason === 'OBJECT_NOT_FOUND');
assert('size off by a single byte -> SIZE_MISMATCH (exact match required, no tolerance)', evaluateUploadVerification({ ...base, primarySize: 999 }).reason === 'SIZE_MISMATCH');
assert('expected size unknown (legacy row) -> size check skipped, not a failure', evaluateUploadVerification({ ...base, expectedByteSize: null }).ok === true);
assert('reported size unknown from Storage -> size check skipped, not a failure', evaluateUploadVerification({ ...base, primarySize: null }).ok === true);
assert('thumbnail required but missing -> THUMBNAIL_MISSING', evaluateUploadVerification({ ...base, hasThumbnail: true, thumbnailExists: false }).reason === 'THUMBNAIL_MISSING');
assert('thumbnail required and present -> ok', evaluateUploadVerification({ ...base, hasThumbnail: true, thumbnailExists: true }).ok === true);
assert('object missing takes priority over an also-mismatched size', evaluateUploadVerification({ ...base, primaryExists: false, primarySize: 1 }).reason === 'OBJECT_NOT_FOUND');
assert('size mismatch takes priority over a missing thumbnail', evaluateUploadVerification({ ...base, primarySize: 1, hasThumbnail: true, thumbnailExists: false }).reason === 'SIZE_MISMATCH');

report('uploadLifecycle (upload-state transitions + verification outcome)');
