import { assert, importCompiled, report } from './runner.mjs';

const { deriveAssetLifecycleStatus } = await importCompiled(new URL('../../src/features/admin/lib/assetLifecycleStatus.ts', import.meta.url).pathname);

const newAsset = { uploadStatus: 'verifying', securityRequired: true, securityStatus: 'pending', securityReviewStatus: 'pending' };

assert('a brand-new asset awaiting its first scan reads "scanning"', deriveAssetLifecycleStatus(newAsset) === 'scanning');
assert('security_status "scanning" also reads "scanning"', deriveAssetLifecycleStatus({ ...newAsset, securityStatus: 'scanning' }) === 'scanning');

assert(
  'the exact K1.6L/K1.6N confusion case — upload_status still "verifying" but security_status genuinely clean, not yet approved — reads "awaiting-approval", never "scanning" or "ready"',
  deriveAssetLifecycleStatus({ uploadStatus: 'verifying', securityRequired: true, securityStatus: 'clean', securityReviewStatus: 'pending' }) === 'awaiting-approval',
);

assert(
  'clean + approved + upload_status ready reads "ready"',
  deriveAssetLifecycleStatus({ uploadStatus: 'ready', securityRequired: true, securityStatus: 'clean', securityReviewStatus: 'approved' }) === 'ready',
);

assert(
  'clean + approved but upload_status NOT yet ready (should never genuinely happen, but must not be misreported as ready) reads "awaiting-approval", not "ready" — never inferring completion from the review flag alone',
  deriveAssetLifecycleStatus({ uploadStatus: 'verifying', securityRequired: true, securityStatus: 'clean', securityReviewStatus: 'approved' }) === 'awaiting-approval',
);

assert('an infected asset always reads "infected", even if somehow marked approved', deriveAssetLifecycleStatus({ uploadStatus: 'verifying', securityRequired: true, securityStatus: 'infected', securityReviewStatus: 'approved' }) === 'infected');

assert('a genuine scan error reads "scan-error"', deriveAssetLifecycleStatus({ ...newAsset, securityStatus: 'error' }) === 'scan-error');

assert('a legacy asset (security_required = false) reads "legacy" regardless of its other fields', deriveAssetLifecycleStatus({ uploadStatus: 'ready', securityRequired: false, securityStatus: 'legacy_unverified', securityReviewStatus: 'pending' }) === 'legacy');

assert('upload_status "failed" reads "upload-failed", taking priority over any security_status', deriveAssetLifecycleStatus({ ...newAsset, uploadStatus: 'failed' }) === 'upload-failed');

assert('upload_status "uploading" (before any scan request) reads "uploading", not "scanning" — nothing has been scanned yet', deriveAssetLifecycleStatus({ uploadStatus: 'uploading', securityRequired: true, securityStatus: 'pending', securityReviewStatus: 'pending' }) === 'uploading');

assert('upload_status "pending" (before the client has even started uploading) reads "pending-upload"', deriveAssetLifecycleStatus({ uploadStatus: 'pending', securityRequired: true, securityStatus: 'pending', securityReviewStatus: 'pending' }) === 'pending-upload');

report('assetLifecycleStatus (Stage K1.6Q — distinguishing scanning / awaiting-approval / ready, never inferring completion from a label alone)');
