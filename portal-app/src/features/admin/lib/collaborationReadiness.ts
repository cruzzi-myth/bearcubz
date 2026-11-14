// Stage K1.6L — a readiness checklist for the admin dashboard,
// computed entirely from existing columns (collaborations.bpm/
// musical_key, collaboration_assets.asset_type/is_active/
// upload_status/security_required/security_status/
// security_review_status/is_primary_cover/approval_status,
// collaboration_members.status). No new database state: "ready to
// invite" is deliberately NOT one of these checks — that decision
// belongs only to the project owner, never computed as done/not-done
// here (see CollaborationsTab/AdminCollaborationBriefing — this
// never sends an invitation itself).
export type ReadinessInput = {
  bpm: number | null;
  musicalKey: string | null;
  hasAudio: boolean;
  hasProposal: boolean;
  hasPrimaryCover: boolean;
  primaryCoverApproved: boolean;
  anySecurityRequiredAsset: boolean;
  allSecurityRequiredAssetsClean: boolean;
  allSecurityRequiredAssetsApproved: boolean;
  activeMemberCount: number;
};

export type ReadinessCheck = { key: string; label: string; complete: boolean };

export function buildReadinessChecklist(input: ReadinessInput): ReadinessCheck[] {
  return [
    { key: 'metadata', label: 'Required metadata complete (BPM + musical key)', complete: input.bpm !== null && Boolean(input.musicalKey?.trim()) },
    { key: 'audio', label: 'Required audio available', complete: input.hasAudio },
    { key: 'proposal', label: 'Proposal available', complete: input.hasProposal },
    { key: 'artwork', label: 'Artwork reviewed (primary cover approved)', complete: input.hasPrimaryCover && input.primaryCoverApproved },
    // A collaboration with no security-required assets yet (e.g. only
    // legacy pre-scanning assets) has nothing left to scan, so this
    // reads complete rather than stuck on a check that will never run.
    { key: 'scanning', label: 'Malware scanning complete', complete: !input.anySecurityRequiredAsset || input.allSecurityRequiredAssetsClean },
    { key: 'security_review', label: 'Security approval complete', complete: !input.anySecurityRequiredAsset || input.allSecurityRequiredAssetsApproved },
    { key: 'permissions', label: 'Artist permissions configured', complete: input.activeMemberCount > 0 },
  ];
}
