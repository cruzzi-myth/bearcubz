import type { StorableClassification } from '../../../lib/collaborationClassification';

export type CollaborationStatus = 'draft' | 'invited' | 'active' | 'completed' | 'archived';
// Stage K1.5B: the single source of truth for the three storable
// values is collaborationClassification.ts — imported, not
// redefined, so the two can never drift out of sync.
export type ProjectClassification = StorableClassification;
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type UploadStatus = 'pending' | 'uploading' | 'verifying' | 'ready' | 'failed';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type AssetType = 'audio_short' | 'audio_full' | 'proposal_pdf' | 'track_cover' | 'alternate_cover' | 'visual_image' | 'visual_concept';

export type AdminArtistProfile = {
  userId: string;
  displayName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminCollaboration = {
  id: string;
  title: string;
  artistDisplayName: string;
  status: CollaborationStatus;
  bpm: number | null;
  musicalKey: string | null;
  genreTags: string[] | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
  primaryCoverAssetId: string | null;
  classification: ProjectClassification | null;
};

export type AdminMembership = {
  collaborationId: string;
  userId: string;
  role: string;
  status: 'active' | 'revoked';
  addedAt: string;
  revokedAt: string | null;
};

export type AdminInvitation = {
  id: string;
  email: string;
  collaborationId: string | null;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type AdminAsset = {
  id: string;
  collaborationId: string;
  assetType: AssetType;
  displayLabel: string;
  description: string | null;
  version: number;
  approvalStatus: ApprovalStatus | null;
  isPrimaryCover: boolean;
  isActive: boolean;
  uploadStatus: UploadStatus;
  mimeType: string;
  byteSize: number | null;
  uploadedBy: string;
  uploadedAt: string;
  verifiedAt: string | null;
  scanLeaseExpiresAt: string | null;
  securityRequired: boolean;
  securityStatus: string;
  securityReviewStatus: string;
  scanEvidence: { provider?: string; detail?: string; complete?: boolean } | null;
};

export type AdminFeedbackMessage = {
  id: string;
  collaborationId: string;
  authorId: string;
  isAdminReply: boolean;
  kind: string;
  body: string;
  createdAt: string;
};

export type AdminAuditEntry = {
  id: string;
  adminId: string;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  details: unknown;
  createdAt: string;
};

// Stage K1.6D — the single linear lifecycle state from the
// collaboration_feedback_attachments migration (K1.6C rev.3). Admins
// see every status; an ordinary member only ever sees 'available' (or
// their own row's real status, per the K1.6D "survives a refresh"
// policy — not relevant to this admin-only type).
export type AttachmentStatus = 'pending_upload' | 'uploaded' | 'awaiting_scan' | 'rejected' | 'clean' | 'promoting' | 'available' | 'failed';

// Stage K1.6E — malware clearance and administrator approval are
// separate, server-controlled fields, independent of the physical-
// location `status` lifecycle above (see the K1.6E migration's own
// comment for the full rationale).
export type SecurityStatus = 'pending' | 'scanning' | 'clean' | 'infected' | 'error';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type AdminAttachment = {
  id: string;
  feedbackId: string;
  collaborationId: string;
  collaborationTitle: string;
  messageBody: string;
  authorId: string;
  authorIsAdminReply: boolean;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  status: AttachmentStatus;
  securityStatus: SecurityStatus;
  securityScanDetail: string | null;
  scanProvider: string | null;
  reviewStatus: ReviewStatus;
  rejectionReason: string | null;
  uploadedAt: string;
  promotionError: string | null;
  // Stage K1.6G section 8 — lease/retry bookkeeping surfaced for
  // administrator recovery visibility. None of these drive any
  // access-control decision on the frontend; they are read-only
  // displays of state the server already enforces.
  scanAttemptCount: number;
  scanStartedAt: string | null;
  scanCompletedAt: string | null;
  scanLastError: string | null;
  scanNextRetryAt: string | null;
  awaitingScannerCapacity: boolean;
  scanWaitingSince: string | null;
  scanRetentionExpiresAt: string | null;
  isActive: boolean;
};
