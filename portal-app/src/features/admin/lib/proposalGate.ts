// Eligibility of a Phase 01 invitation that depends on a revised proposal.
// MUST stay equivalent to revisedProposalReady() in
// supabase/functions/_shared/invitationPolicy.ts — the backend is the
// authority (it re-checks on every send); this only decides what the
// Command Center shows and whether it offers the Send button. A parity test
// (tests/security/proposalGateParity.test.mjs) runs both against the same cases.
export const SUPERSEDED_PROPOSAL_SHA256: Readonly<Record<string, string>> = {
  'c297d5be-14d9-4f2b-93e2-a184e1ed2b83': 'e6a3fcdc50ec5799dae63f53b0d414d6a41500337b1b00ea0b34f28a2df78a3e',
};

export interface ProposalAssetFacts {
  assetType: string;
  isActive: boolean;
  uploadStatus: string;
  securityStatus: string;
  securityReviewStatus: string | null;
  fileSha256: string | null;
}

export type ProposalGate = { ready: true } | { ready: false; reason: 'ORIGINAL_STILL_ACTIVE' | 'NO_VERIFIED_REVISION' };

export function proposalGate(collaborationId: string, assets: ProposalAssetFacts[]): ProposalGate {
  const superseded = SUPERSEDED_PROPOSAL_SHA256[collaborationId];
  if (!superseded) return { ready: true };
  const proposals = assets.filter((a) => a.assetType === 'proposal_pdf' && a.isActive);
  if (proposals.some((a) => a.fileSha256 === superseded)) return { ready: false, reason: 'ORIGINAL_STILL_ACTIVE' };
  const verified = proposals.some(
    (a) =>
      a.fileSha256 !== null &&
      a.fileSha256 !== superseded &&
      a.uploadStatus === 'ready' &&
      a.securityStatus === 'clean' &&
      a.securityReviewStatus === 'approved',
  );
  return verified ? { ready: true } : { ready: false, reason: 'NO_VERIFIED_REVISION' };
}

export const PROPOSAL_GATE_MESSAGE: Record<'ORIGINAL_STILL_ACTIVE' | 'NO_VERIFIED_REVISION', string> = {
  ORIGINAL_STILL_ACTIVE: 'Blocked: the original proposal is still active. The revised proposal must replace it.',
  NO_VERIFIED_REVISION: 'Blocked: no revised proposal is active, scanned clean and security-approved yet.',
};
