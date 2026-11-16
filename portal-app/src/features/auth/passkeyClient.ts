import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { supabase } from '../../services/supabaseClient';
import { classifyWebAuthnError } from './passkeyErrors';

const REQUEST_TIMEOUT_MS = 15_000;

export type PasskeySignInResult =
  | { kind: 'signed-in' }
  | { kind: 'cancelled' | 'unsupported' | 'failed' | 'rate-limited' | 'network' };

async function call<T>(fn: 'portal-passkey-auth' | 'portal-admin-passkeys', body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; status: number | null; code: string }> {
  const { data, error } = await supabase.functions.invoke(fn, { body, timeout: REQUEST_TIMEOUT_MS });
  if (!error) return { ok: true, data: data as T };
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const b = await ctx.clone().json();
      return { ok: false, status: ctx.status, code: String(b?.error ?? 'FAILED') };
    } catch {
      return { ok: false, status: ctx.status, code: 'FAILED' };
    }
  }
  return { ok: false, status: null, code: 'NETWORK' };
}

/**
 * Passkey sign-in for administrators. The server verifies the WebAuthn
 * assertion and re-checks administrator status; the session itself is issued by
 * Supabase Auth (documented generateLink -> verifyOtp), never built here.
 */
export async function signInWithPasskey(): Promise<PasskeySignInResult> {
  if (!browserSupportsWebAuthn()) return { kind: 'unsupported' };

  const opts = await call<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON']; challengeId: string }>('portal-passkey-auth', { op: 'options' });
  if (!opts.ok) return { kind: opts.status === 429 ? 'rate-limited' : opts.status === null ? 'network' : 'failed' };

  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: opts.data.options });
  } catch (err) {
    const outcome = classifyWebAuthnError(err);
    return { kind: outcome === 'already-registered' ? 'failed' : outcome };
  }

  const verified = await call<{ tokenHash: string }>('portal-passkey-auth', { op: 'verify', challengeId: opts.data.challengeId, response: assertion });
  if (!verified.ok) return { kind: verified.status === 429 ? 'rate-limited' : verified.status === null ? 'network' : 'failed' };

  const { error } = await supabase.auth.verifyOtp({ token_hash: verified.data.tokenHash, type: 'magiclink' });
  return error ? { kind: 'failed' } : { kind: 'signed-in' };
}

export type PasskeySummary = { id: string; name: string; created_at: string; last_used_at: string | null; revoked_at: string | null; device_type: string | null; backed_up: boolean };

export async function listPasskeys() {
  return call<{ passkeys: PasskeySummary[] }>('portal-admin-passkeys', { op: 'list' });
}

export async function registerPasskey(name: string): Promise<{ ok: true } | { ok: false; code: 'REAUTH_REQUIRED' | 'CANCELLED' | 'ALREADY_REGISTERED' | 'UNSUPPORTED' | 'FAILED' }> {
  if (!browserSupportsWebAuthn()) return { ok: false, code: 'UNSUPPORTED' };
  const opts = await call<{ options: Parameters<typeof startRegistration>[0]['optionsJSON']; challengeId: string }>('portal-admin-passkeys', { op: 'registration-options' });
  if (!opts.ok) return { ok: false, code: opts.code === 'REAUTH_REQUIRED' ? 'REAUTH_REQUIRED' : 'FAILED' };
  let attestation;
  try {
    attestation = await startRegistration({ optionsJSON: opts.data.options });
  } catch (err) {
    const o = classifyWebAuthnError(err);
    return { ok: false, code: o === 'cancelled' ? 'CANCELLED' : o === 'already-registered' ? 'ALREADY_REGISTERED' : o === 'unsupported' ? 'UNSUPPORTED' : 'FAILED' };
  }
  const done = await call('portal-admin-passkeys', { op: 'registration-verify', challengeId: opts.data.challengeId, response: attestation, name });
  if (!done.ok) return { ok: false, code: done.code === 'REAUTH_REQUIRED' ? 'REAUTH_REQUIRED' : 'FAILED' };
  return { ok: true };
}

export async function renamePasskey(passkeyId: string, name: string) {
  return call('portal-admin-passkeys', { op: 'rename', passkeyId, name });
}

export async function revokePasskey(passkeyId: string) {
  return call('portal-admin-passkeys', { op: 'revoke', passkeyId });
}
