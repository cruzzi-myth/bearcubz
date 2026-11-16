// Classifies errors thrown by the browser's WebAuthn ceremony (via
// @simplewebauthn/browser) into the few outcomes the UI distinguishes. Pure so it
// is unit-tested without a browser.
export type PasskeyOutcome = 'cancelled' | 'already-registered' | 'unsupported' | 'failed';

export function classifyWebAuthnError(err: unknown): PasskeyOutcome {
  const e = err as { name?: string; code?: string; message?: string } | null;
  const name = e?.name ?? '';
  const code = e?.code ?? '';
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') return 'already-registered';
  // NotAllowedError is what browsers raise for a dismissed prompt, a failed
  // Touch ID/Face ID check, a timeout — and for "no matching passkey here".
  if (name === 'NotAllowedError' || code === 'ERROR_CEREMONY_ABORTED' || name === 'AbortError') return 'cancelled';
  if (name === 'NotSupportedError' || code === 'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCRED_ALG') return 'unsupported';
  return 'failed';
}

export const PASSKEY_MESSAGES = {
  prompt: 'Waiting for your passkey… confirm with Touch ID, Face ID or your security key.',
  cancelled: 'Passkey sign-in was cancelled or no passkey was available on this device.',
  unsupported: 'This browser or device cannot use passkeys.',
  failed: "We couldn't verify that passkey. Nothing was changed.",
  rateLimited: 'Too many attempts. Please wait a few minutes, or use the email sign-in link.',
  network: "We couldn't reach Signal Portal. Check your connection and try again.",
  registered: 'PASSKEY REGISTERED // SECURE ACCESS ENABLED',
  reauth: 'For security, sign in again (email link or passkey) before registering or removing a passkey.',
} as const;
