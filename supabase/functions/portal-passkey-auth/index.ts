// PUBLIC (anon key) passkey sign-in for ADMINISTRATORS.
//
//   op "options": issue a single-use, 120s challenge (discoverable credentials —
//                 no email is needed or accepted, so nothing reveals who is an admin).
//   op "verify" : verify the WebAuthn assertion (origin, RP ID, signature, flags,
//                 user verification, counter), re-check administrator status
//                 SERVER-SIDE, then ask Supabase Auth — through its documented
//                 admin generateLink API — for a single-use token hash that the
//                 browser redeems with verifyOtp. No token is ever built or signed here.
import { generateAuthenticationOptions, verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@14.1.0';
import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import {
  resolveWebAuthnConfig, isChallengeUsable, rateLimitDecision, isPlausibleAuthResponse, b64urlDecode,
  CHALLENGE_TTL_MS, RATE_WINDOW_MS,
} from '../_shared/passkeyPolicy.ts';

const GENERIC_FAILURE = { error: 'AUTH_FAILED' }; // deliberately uniform: no oracle for which step failed

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);
  const cfg = resolveWebAuthnConfig((n) => Deno.env.get(n));
  if (!cfg.ok) return json({ error: 'SERVER_CONFIG' }, 500);

  let body: { op?: string; challengeId?: string; response?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }

  const db = createAdminClient(env.supabaseUrl, env.serviceKey);
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim().slice(0, 64) || 'unknown';
  const logAttempt = (kind: 'options' | 'verify', ok: boolean) => db.from('portal_passkey_attempts').insert({ ip, kind, ok });

  // Rate limit (per IP) before doing any work.
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const recent = await db.from('portal_passkey_attempts').select('kind, ok').eq('ip', ip).gte('created_at', since).limit(200);
  const rows = recent.data ?? [];
  const limited = rateLimitDecision({
    failedVerifyForIp: rows.filter((r) => r.kind === 'verify' && !r.ok).length,
    attemptsForIp: rows.length,
  });
  if (limited === 'limited') return json({ error: 'RATE_LIMITED' }, 429);

  // Opportunistic cleanup of expired challenges.
  await db.from('portal_webauthn_challenges').delete().lt('expires_at', new Date(Date.now() - 60_000).toISOString());

  if (body.op === 'options') {
    const options = await generateAuthenticationOptions({
      rpID: cfg.config.rpID,
      userVerification: 'required',
      timeout: 60_000,
    });
    const stored = await db
      .from('portal_webauthn_challenges')
      .insert({ challenge: options.challenge, purpose: 'authenticate', expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString() })
      .select('id')
      .single();
    if (stored.error) return json({ error: 'SERVER_ERROR' }, 500);
    await logAttempt('options', true);
    return json({ ok: true, options, challengeId: stored.data.id });
  }

  if (body.op === 'verify') {
    const fail = async (status = 401) => { await logAttempt('verify', false); return json(GENERIC_FAILURE, status); };
    if (typeof body.challengeId !== 'string' || !isPlausibleAuthResponse(body.response)) return fail(400);
    const response = body.response as { id: string; response: { userHandle?: string } } & Record<string, unknown>;

    // Single-use: DELETE ... RETURNING is atomic, so a replayed or concurrent
    // request finds nothing.
    const consumed = await db
      .from('portal_webauthn_challenges')
      .delete()
      .eq('id', body.challengeId)
      .eq('purpose', 'authenticate')
      .select('challenge, expires_at')
      .maybeSingle();
    if (!consumed.data || !isChallengeUsable(Date.parse(consumed.data.expires_at), Date.now())) return fail();

    const cred = await db
      .from('portal_admin_passkeys')
      .select('id, user_id, credential_id, public_key, counter, transports, revoked_at')
      .eq('credential_id', response.id)
      .is('revoked_at', null)
      .maybeSingle();
    if (!cred.data) return fail();

    let verified = false;
    let newCounter = cred.data.counter as number;
    try {
      const result = await verifyAuthenticationResponse({
        response: response as never,
        expectedChallenge: consumed.data.challenge,
        expectedOrigin: cfg.config.origins,
        expectedRPID: cfg.config.rpID,
        requireUserVerification: true,
        credential: {
          id: cred.data.credential_id,
          publicKey: b64urlDecode(cred.data.public_key) as never,
          counter: Number(cred.data.counter),
          transports: (cred.data.transports ?? []) as never,
        },
      });
      verified = result.verified;
      newCounter = result.authenticationInfo.newCounter;
    } catch {
      return fail();
    }
    if (!verified) return fail();

    // The credential's owner must STILL be an active administrator (server-side).
    const admin = await db.from('portal_admins').select('user_id').eq('user_id', cred.data.user_id).is('revoked_at', null).maybeSingle();
    if (!admin.data) return fail(403);

    // Optimistic counter update: a concurrent use of the same assertion state loses.
    const bumped = await db
      .from('portal_admin_passkeys')
      .update({ counter: newCounter, last_used_at: new Date().toISOString() })
      .eq('id', cred.data.id)
      .eq('counter', cred.data.counter)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();
    if (!bumped.data) return fail();

    const user = await db.auth.admin.getUserById(cred.data.user_id);
    const email = user.data.user?.email;
    if (!email) return fail();
    const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) return fail(500);

    await logAttempt('verify', true);
    await db.from('portal_admin_audit_log').insert({
      admin_id: cred.data.user_id,
      action: 'passkey_login',
      target_table: 'portal_admin_passkeys',
      target_id: cred.data.id,
      details: { credential: cred.data.credential_id.slice(0, 8) },
    });
    return json({ ok: true, tokenHash });
  }

  return json({ error: 'INVALID_OP' }, 400);
});
