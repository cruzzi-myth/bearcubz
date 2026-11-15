// Stage K1.6Q — the Asset Library previously showed a CLEAN,
// awaiting-approval asset with upload_status literally "verifying" —
// technically correct (a clean scan and the administrator's security
// release are deliberately independent gates, unchanged since
// K1.6E), but easy to misread as "still scanning" or "stuck" (see
// the real K1.6L investigation this exact confusion caused). This
// derives one unambiguous display state purely from already-real
// backend fields — scan completion is read from security_status and
// the genuine scan evidence relationship it implies, never inferred
// from a "clean" label alone, and never from upload_status alone
// either, since upload_status only reaches 'ready' after approval.
export type AssetLifecycleStatus =
  | 'pending-upload'
  | 'uploading'
  | 'upload-failed'
  | 'scanning'
  | 'scan-error'
  | 'infected'
  | 'awaiting-approval'
  | 'ready'
  | 'legacy';

export type AssetLifecycleInput = {
  uploadStatus: string;
  securityRequired: boolean;
  securityStatus: string;
  securityReviewStatus: string;
};

export function deriveAssetLifecycleStatus(a: AssetLifecycleInput): AssetLifecycleStatus {
  if (a.securityStatus === 'infected') return 'infected';
  if (a.uploadStatus === 'failed') return 'upload-failed';
  if (!a.securityRequired) return 'legacy';
  if (a.securityStatus === 'error') return 'scan-error';
  if (a.securityStatus === 'clean' && a.securityReviewStatus === 'approved' && a.uploadStatus === 'ready') return 'ready';
  if (a.securityStatus === 'clean') return 'awaiting-approval';
  // Before the object exists in Storage, security_status is still
  // just its 'pending' default — checking upload_status first here
  // avoids calling that "scanning", which hasn't started yet.
  if (a.uploadStatus === 'pending') return 'pending-upload';
  if (a.uploadStatus === 'uploading') return 'uploading';
  return 'scanning';
}

export const LIFECYCLE_STATUS_META: Record<AssetLifecycleStatus, { label: string; pillClass: string }> = {
  'pending-upload': { label: 'Pending Upload', pillClass: 'sp-admin__pill--muted' },
  uploading: { label: 'Uploading…', pillClass: 'sp-admin__pill--muted' },
  'upload-failed': { label: 'Upload Failed', pillClass: 'sp-admin__pill--bad' },
  scanning: { label: 'Scanning In Progress', pillClass: 'sp-admin__pill--warn' },
  'scan-error': { label: 'Scan Error', pillClass: 'sp-admin__pill--bad' },
  infected: { label: 'Infected — Blocked', pillClass: 'sp-admin__pill--bad' },
  'awaiting-approval': { label: 'Scan Complete — Awaiting Admin Approval', pillClass: 'sp-admin__pill--warn' },
  ready: { label: 'Ready', pillClass: '' },
  legacy: { label: 'Legacy — Unverified', pillClass: 'sp-admin__pill--muted' },
};
