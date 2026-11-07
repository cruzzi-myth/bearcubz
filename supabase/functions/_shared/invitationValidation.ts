// Pure validation logic for artist invitations — no Deno/Supabase APIs,
// so it can be unit-tested directly (see
// portal-app/tests/security/invitationValidation.test.mjs) in addition
// to being used by portal-admin-create-invitation.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DEFAULT_EXPIRY_DAYS = 14;
export const MAX_EXPIRY_DAYS = 90;

export function normalizeInvitationEmail(rawEmail: string | undefined | null): string {
  return (rawEmail ?? '').trim().toLowerCase();
}

export function isValidInvitationEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/** Clamps a requested expiry to (0, MAX_EXPIRY_DAYS] days, falling back
 * to DEFAULT_EXPIRY_DAYS for anything missing, non-finite, zero,
 * negative, or past the cap — never trusts the caller's number as-is. */
export function resolveExpiryDays(requested: number | undefined | null): number {
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0 && requested <= MAX_EXPIRY_DAYS) {
    return requested;
  }
  return DEFAULT_EXPIRY_DAYS;
}
