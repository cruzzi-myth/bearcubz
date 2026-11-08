export type CollaborationStatus = 'draft' | 'invited' | 'active' | 'completed' | 'archived';
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
