import type { AdminInvitation } from '../types/adminTypes';

export type InvitationStage = 'created' | 'requested' | 'sent' | 'failed' | 'accepted' | 'expired' | 'revoked';

/** One honest stage per invitation. 'sent' only ever means Supabase Auth
 * accepted the message for the configured mail provider — inbox delivery
 * is not observable, so it is never described as "delivered". */
export function invitationStage(inv: Pick<AdminInvitation, 'status' | 'expiresAt' | 'delivery'>, now = Date.now()): InvitationStage {
  if (inv.status === 'accepted') return 'accepted';
  if (inv.status === 'revoked') return 'revoked';
  if (inv.status === 'expired' || Date.parse(inv.expiresAt) <= now) return 'expired';
  const d = inv.delivery?.status;
  if (d === 'sent') return 'sent';
  if (d === 'failed') return 'failed';
  if (d === 'requested') return 'requested';
  return 'created';
}

export const STAGE_LABEL: Record<InvitationStage, string> = {
  created: 'Invitation created',
  requested: 'Email delivery requested',
  sent: 'Email sent (accepted by mail provider)',
  failed: 'Delivery failed',
  accepted: 'Invitation accepted',
  expired: 'Invitation expired',
  revoked: 'Invitation revoked',
};

const SEND_ERRORS: Record<string, string> = {
  RECIPIENT_NOT_AUTHORIZED: 'This address and collaboration are not an approved Phase 01 recipient.',
  REVISED_PROPOSAL_NOT_READY: 'The revised proposal has not replaced the original yet, or is not scanned and security-approved.',
  ALREADY_MEMBER: 'This artist already has active access to this collaboration.',
  SEND_IN_PROGRESS: 'A send for this invitation is already in progress.',
  ALREADY_SENT_RECENTLY: 'An email was sent for this invitation moments ago. Wait before sending again.',
  INVALID_COLLABORATION: 'That collaboration does not exist.',
  NOT_AUTHORIZED: 'Administrator access is required.',
};

export function describeSendError(code: string): string {
  return SEND_ERRORS[code] ?? 'The invitation could not be sent.';
}
