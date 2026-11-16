// What the landing page's ACCESS PORTAL / fingerprint buttons should do. Pure
// (no React, no network) so it is unit-tested directly. It consumes ONLY the
// outcome PortalAuthContext derived from a real session plus the server-side
// is_portal_admin() / membership check — an email address alone never grants
// anything here, and "request-link" only ever asks the backend to email a link.
import type { PortalAuthStatus, PortalAuthorization } from './PortalAuthContext';

export type AccessDecision =
  | { kind: 'wait' }
  | { kind: 'route'; path: '/dashboard' | '/artist' }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'request-link' };

export function decideAccessAction(input: { authStatus: PortalAuthStatus; authorization: PortalAuthorization; isAdmin: boolean }): AccessDecision {
  const { authStatus, authorization, isAdmin } = input;
  if (authStatus === 'loading') return { kind: 'wait' };
  if (authStatus === 'signed-out') return { kind: 'request-link' };

  // Signed in: the session must be verified server-side before we route anywhere.
  switch (authorization) {
    case 'checking':
      return { kind: 'wait' };
    case 'authorized':
      return { kind: 'route', path: isAdmin ? '/dashboard' : '/artist' };
    case 'revoked':
      return { kind: 'denied', message: 'Your Signal Portal access has been revoked. Contact THE COLLECTIVE if you believe this is a mistake.' };
    case 'not-authorized':
      return { kind: 'denied', message: 'This account is not authorized for Signal Portal. Sign out and use the email address you were invited with.' };
    case 'backend-unavailable':
      return { kind: 'error', message: "The Signal Portal backend isn't available right now. Please try again shortly." };
    default:
      return { kind: 'error', message: "We couldn't verify your access just now. Please try again." };
  }
}

export const LINK_COOLDOWN_SECONDS = 60;
export const REQUEST_TIMEOUT_MS = 15_000;
export const SESSION_CHECK_TIMEOUT_MS = 12_000;

export const ACCESS_MESSAGES = {
  submitted:
    'Check your inbox. If this address is authorized for Signal Portal, a secure sign-in link is on its way. It can take a minute — check spam, and use only the newest link.',
  networkError: "We couldn't reach Signal Portal. Check your connection and try again.",
  timeout: 'The request timed out. Nothing was lost — please try again.',
  checkingSession: 'Checking your session…',
  sessionTimeout: "We couldn't confirm your session in time. Please try again.",
} as const;

export function cooldownRemainingSeconds(sentAtMs: number | null, nowMs: number): number {
  if (sentAtMs === null) return 0;
  return Math.max(0, Math.ceil(LINK_COOLDOWN_SECONDS - (nowMs - sentAtMs) / 1000));
}
