// Pure policy logic for the administrator-triggered invitation send
// (Invitation Phase 01). No Deno/Supabase APIs, so it is unit-tested
// directly (portal-app/tests/security/invitationPolicy.test.mjs).

export interface Phase01Recipient {
  email: string;
  collaborationId: string;
  artistName: string;
  collaborationTitle: string;
  /** True when a revised proposal must replace the superseded one
   * (and be clean + approved) before this invitation may be sent. */
  requiresRevisedProposal: boolean;
}

/** The ONLY (email, collaboration) pairs the send action will mail in
 * Phase 01. Exact pairs, not a pattern — an address is never inferred
 * from an artist name, and XYLØ / Issey Cross are deliberately absent. */
export const PHASE01_RECIPIENTS: readonly Phase01Recipient[] = [
  {
    email: 'bearcubzmusic@gmail.com',
    collaborationId: 'fb260abd-2c12-479b-a7db-047e3da810fc',
    artistName: 'BEλR CUBZ',
    collaborationTitle: 'CLIMBING TREES',
    requiresRevisedProposal: false,
  },
  {
    email: 'setiahaven@gmail.com',
    collaborationId: 'c297d5be-14d9-4f2b-93e2-a184e1ed2b83',
    artistName: 'Setia Saint Haven',
    collaborationTitle: 'WONKY LIQUID DREAMS',
    requiresRevisedProposal: true,
  },
];

/** SHA-256 of the original (superseded) WONKY LIQUID DREAMS proposal.
 * The revised proposal must be a different, active, clean, approved file. */
export const SUPERSEDED_PROPOSAL_SHA256: Readonly<Record<string, string>> = {
  'c297d5be-14d9-4f2b-93e2-a184e1ed2b83': 'e6a3fcdc50ec5799dae63f53b0d414d6a41500337b1b00ea0b34f28a2df78a3e',
};

export function findPhase01Recipient(email: string, collaborationId: string): Phase01Recipient | null {
  const e = email.trim().toLowerCase();
  return PHASE01_RECIPIENTS.find((r) => r.email === e && r.collaborationId === collaborationId) ?? null;
}

export interface ProposalAssetRow {
  asset_type: string;
  is_active: boolean;
  upload_status: string;
  security_status: string;
  security_review_status: string | null;
  file_sha256: string | null;
}

/** True only when the collaboration has a ready, clean, security-
 * approved, active proposal PDF whose hash differs from the superseded
 * one, and the superseded file is no longer an active proposal. */
export function revisedProposalReady(collaborationId: string, assets: ProposalAssetRow[]): boolean {
  const superseded = SUPERSEDED_PROPOSAL_SHA256[collaborationId];
  if (!superseded) return true;
  const proposals = assets.filter((a) => a.asset_type === 'proposal_pdf' && a.is_active);
  if (proposals.some((a) => a.file_sha256 === superseded)) return false;
  return proposals.some(
    (a) =>
      a.file_sha256 !== null &&
      a.file_sha256 !== superseded &&
      a.upload_status === 'ready' &&
      a.security_status === 'clean' &&
      a.security_review_status === 'approved',
  );
}

export type EmailFailureCode = 'EMAIL_RATE_LIMITED' | 'SMTP_NOT_CONFIGURED' | 'SMTP_REJECTED' | 'EMAIL_SEND_FAILED';

/** Maps a Supabase Auth error to an actionable, non-leaky category. */
export function classifyEmailError(error: { message?: string; code?: string; status?: number } | null | undefined): {
  code: EmailFailureCode;
  message: string;
} {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('over_email_send_rate_limit') || text.includes('rate limit')) {
    return {
      code: 'EMAIL_RATE_LIMITED',
      message:
        "Supabase's email rate limit was reached. Configure custom SMTP (Authentication → Emails → SMTP Settings) and raise 'Emails sent per hour' (Authentication → Rate Limits), then retry. The limit was not bypassed.",
    };
  }
  if (text.includes('not authorized') || (text.includes('smtp') && text.includes('not'))) {
    return {
      code: 'SMTP_NOT_CONFIGURED',
      message:
        "Custom SMTP is not configured: Supabase's built-in mail service only sends to project team members. Enable custom SMTP in Authentication → Emails → SMTP Settings, then retry.",
    };
  }
  if (text.includes('error sending') || text.includes('smtp') || text.includes('unexpected_failure')) {
    return {
      code: 'SMTP_REJECTED',
      message: 'The configured mail provider rejected or failed to send the message. Check the SMTP credentials and sender domain in Authentication → Emails → SMTP Settings.',
    };
  }
  return { code: 'EMAIL_SEND_FAILED', message: 'The email could not be sent. See the project Auth logs for detail.' };
}

export type SendGate = 'allow' | 'in-flight' | 'recently-sent';
const IN_FLIGHT_MS = 2 * 60_000;
const RECENT_SENT_MS = 15 * 60_000;

/** Duplicate-send prevention based on the most recent audited attempt. */
export function sendCooldownDecision(last: { status: string; atMs: number } | null, nowMs: number): SendGate {
  if (!last) return 'allow';
  const age = nowMs - last.atMs;
  if (last.status === 'requested' && age < IN_FLIGHT_MS) return 'in-flight';
  if (last.status === 'sent' && age < RECENT_SENT_MS) return 'recently-sent';
  return 'allow';
}
