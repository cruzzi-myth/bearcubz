// ADMIN-ONLY passkey management: list / register / rename / revoke.
// Enrollment and removal require (a) a server-verified administrator and
// (b) a RECENT sign-in (the access token's amr timestamp). The browser can
// never write the passkey tables directly (no grants, no policies).
import { generateRegistrationOptions, verifyRegistrationResponse } from 'npm:@simplewebauthn/server@14.1.0';
import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';
import { resolveWebAuthnConfig, isChallengeUsable, isRecentAuth, normalizePasskeyName, b64urlEncode, CHALLENGE_TTL_MS } from '../_shared/passkeyPolicy.ts';

function claimsOf(authHeader: string | null): { amr?: { method?: string; timestamp?: number }[] } | null {
  try {
    const token = (authHeader ?? '').replace(/^Bearer\s+/i, '');
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);
  const cfg = resolveWebAuthnConfig((n) => Deno.env.get(n));
  if (!cfg.ok) return json({ error: 'SERVER_CONFIG' }, 500);

  const authHeader = request.headers.get('Authorization');
  const admin = await requireAdmin(env.supabaseUrl, authHeader);
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: { op?: string; challengeId?: string; response?: unknown; name?: unknown; passkeyId?: string };
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }

  const db = createAdminClient(env.supabaseUrl, env.serviceKey);
  const audit = (action: string, targetId: string | null, details: Record<string, unknown>) =>
    db.from('portal_admin_audit_log').insert({ admin_id: admin.uid, action, target_table: 'portal_admin_passkeys', target_id: targetId, details });
  const recent = () => isRecentAuth(claimsOf(authHeader), Date.now());

  if (body.op === 'list') {
    const { data, error } = await db
      .from('portal_admin_passkeys')
      .select('id, name, created_at, last_used_at, revoked_at, device_type, backed_up')
      .eq('user_id', admin.uid)
      .order('created_at', { ascending: true });
    if (error) return json({ error: 'LIST_FAILED' }, 500);
    return json({ ok: true, passkeys: data ?? [] });
  }

  if (body.op === 'registration-options') {
    if (!recent()) return json({ error: 'REAUTH_REQUIRED' }, 403);
    const userRes = await admin.userClient.auth.getUser();
    const email = userRes.data.user?.email ?? 'administrator';
    const existing = await db.from('portal_admin_passkeys').select('credential_id, transports').eq('user_id', admin.uid).is('revoked_at', null);
    const options = await generateRegistrationOptions({
      rpName: cfg.config.rpName,
      rpID: cfg.config.rpID,
      userName: email,
      userID: new TextEncoder().encode(admin.uid),
      attestationType: 'none',
      timeout: 60_000,
      excludeCredentials: (existing.data ?? []).map((c) => ({ id: c.credential_id, transports: (c.transports ?? []) as never })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const stored = await db
      .from('portal_webauthn_challenges')
      .insert({ challenge: options.challenge, purpose: 'register', user_id: admin.uid, expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString() })
      .select('id')
      .single();
    if (stored.error) return json({ error: 'SERVER_ERROR' }, 500);
    return json({ ok: true, options, challengeId: stored.data.id });
  }

  if (body.op === 'registration-verify') {
    if (!recent()) return json({ error: 'REAUTH_REQUIRED' }, 403);
    const name = normalizePasskeyName(body.name ?? 'Passkey');
    if (typeof body.challengeId !== 'string' || !body.response || !name) return json({ error: 'INVALID_INPUT' }, 400);
    const consumed = await db
      .from('portal_webauthn_challenges')
      .delete()
      .eq('id', body.challengeId)
      .eq('purpose', 'register')
      .eq('user_id', admin.uid) // a challenge issued to a different admin can't be used
      .select('challenge, expires_at')
      .maybeSingle();
    if (!consumed.data || !isChallengeUsable(Date.parse(consumed.data.expires_at), Date.now())) return json({ error: 'CHALLENGE_INVALID' }, 400);

    let info;
    try {
      const result = await verifyRegistrationResponse({
        response: body.response as never,
        expectedChallenge: consumed.data.challenge,
        expectedOrigin: cfg.config.origins,
        expectedRPID: cfg.config.rpID,
        requireUserVerification: true,
      });
      if (!result.verified || !result.registrationInfo) return json({ error: 'REGISTRATION_FAILED' }, 400);
      info = result.registrationInfo;
    } catch {
      return json({ error: 'REGISTRATION_FAILED' }, 400);
    }

    const inserted = await db
      .from('portal_admin_passkeys')
      .insert({
        user_id: admin.uid,
        credential_id: info.credential.id,
        public_key: b64urlEncode(info.credential.publicKey as Uint8Array),
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        device_type: info.credentialDeviceType,
        backed_up: info.credentialBackedUp,
        name,
      })
      .select('id, name, created_at')
      .single();
    if (inserted.error) return json({ error: 'REGISTRATION_FAILED' }, 409); // e.g. credential already registered
    await audit('passkey_registered', inserted.data.id, { name });
    return json({ ok: true, passkey: inserted.data });
  }

  if (body.op === 'rename') {
    const name = normalizePasskeyName(body.name);
    if (typeof body.passkeyId !== 'string' || !name) return json({ error: 'INVALID_INPUT' }, 400);
    const updated = await db.from('portal_admin_passkeys').update({ name }).eq('id', body.passkeyId).eq('user_id', admin.uid).is('revoked_at', null).select('id').maybeSingle();
    if (!updated.data) return json({ error: 'NOT_FOUND' }, 404);
    await audit('passkey_renamed', updated.data.id, { name });
    return json({ ok: true });
  }

  if (body.op === 'revoke') {
    if (!recent()) return json({ error: 'REAUTH_REQUIRED' }, 403);
    if (typeof body.passkeyId !== 'string') return json({ error: 'INVALID_INPUT' }, 400);
    const revoked = await db
      .from('portal_admin_passkeys')
      .update({ revoked_at: new Date().toISOString(), revoked_by: admin.uid })
      .eq('id', body.passkeyId)
      .eq('user_id', admin.uid)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();
    if (!revoked.data) return json({ error: 'NOT_FOUND' }, 404);
    await audit('passkey_revoked', revoked.data.id, {});
    return json({ ok: true });
  }

  return json({ error: 'INVALID_OP' }, 400);
});
