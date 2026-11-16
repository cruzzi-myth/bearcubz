// Pure security policy for administrator passkeys (WebAuthn). No Deno/Supabase
// APIs, so it is unit-tested directly (tests/security/passkeyPolicy.test.mjs).

export const PRODUCTION_PROJECT_REF = 'drsidtagxezznqviupsr';
// Production relying party: fixed in code and NEVER overridable by env, so a
// misconfigured secret cannot weaken it. HTTPS only.
export const PRODUCTION_RP_ID = 'bearcubz.com';
export const PRODUCTION_ORIGIN = 'https://bearcubz.com';
export const RP_NAME = 'BEλR CUBZ // THE COLLECTIVE — SIGNAL PORTAL';

export const CHALLENGE_TTL_MS = 120_000;
export const RECENT_AUTH_WINDOW_MS = 15 * 60_000;
export const RATE_WINDOW_MS = 10 * 60_000;
export const MAX_FAILED_VERIFY_PER_IP = 8;
export const MAX_ATTEMPTS_PER_IP = 40;

export type WebAuthnConfig = { rpID: string; rpName: string; origins: string[]; production: boolean };
export type ConfigResult = { ok: true; config: WebAuthnConfig } | { ok: false; reason: string };

export function resolveWebAuthnConfig(get: (name: string) => string | undefined): ConfigResult {
  const supabaseUrl = (get('SUPABASE_URL') ?? '').toLowerCase();
  if (!supabaseUrl) return { ok: false, reason: 'MISSING_SUPABASE_URL' };
  if (supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    return { ok: true, config: { rpID: PRODUCTION_RP_ID, rpName: RP_NAME, origins: [PRODUCTION_ORIGIN], production: true } };
  }
  // Non-production (development/test only): explicit configuration required.
  const rpID = (get('PORTAL_WEBAUTHN_RP_ID') ?? '').trim().toLowerCase();
  const originsRaw = (get('PORTAL_WEBAUTHN_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (!rpID || originsRaw.length === 0) return { ok: false, reason: 'WEBAUTHN_NOT_CONFIGURED' };
  const origins: string[] = [];
  for (const o of originsRaw) {
    let u: URL;
    try { u = new URL(o); } catch { return { ok: false, reason: 'INVALID_ORIGIN' }; }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return { ok: false, reason: 'INSECURE_ORIGIN' };
    if (u.pathname !== '/' || u.search || u.hash) return { ok: false, reason: 'INVALID_ORIGIN' };
    if (u.hostname !== rpID && !u.hostname.endsWith(`.${rpID}`)) return { ok: false, reason: 'ORIGIN_RPID_MISMATCH' };
    origins.push(u.origin);
  }
  return { ok: true, config: { rpID, rpName: RP_NAME, origins, production: false } };
}

export function isChallengeUsable(expiresAtMs: number, nowMs: number): boolean {
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}

export function rateLimitDecision(c: { failedVerifyForIp: number; attemptsForIp: number }): 'allow' | 'limited' {
  if (c.failedVerifyForIp >= MAX_FAILED_VERIFY_PER_IP || c.attemptsForIp >= MAX_ATTEMPTS_PER_IP) return 'limited';
  return 'allow';
}

/** Newest authentication timestamp (ms) from a Supabase access token's `amr` claim, or null. */
export function authTimeMsFromClaims(claims: { amr?: { method?: string; timestamp?: number }[] } | null | undefined): number | null {
  const stamps = (claims?.amr ?? []).map((a) => a?.timestamp).filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  if (stamps.length === 0) return null;
  return Math.max(...stamps) * 1000;
}

/** Enrolling or removing a passkey requires a RECENT sign-in, not just a still-valid session. */
export function isRecentAuth(claims: Parameters<typeof authTimeMsFromClaims>[0], nowMs: number): boolean {
  const t = authTimeMsFromClaims(claims);
  return t !== null && nowMs - t <= RECENT_AUTH_WINDOW_MS && t <= nowMs + 60_000;
}

export function normalizePasskeyName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().replace(/\s+/g, ' ');
  return cleaned.length >= 1 && cleaned.length <= 40 ? cleaned : null;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isPlausibleAuthResponse(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  const resp = o.response as Record<string, unknown> | undefined;
  return (
    typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 1024 && o.type === 'public-key' &&
    !!resp && typeof resp.clientDataJSON === 'string' && typeof resp.authenticatorData === 'string' && typeof resp.signature === 'string'
  );
}
