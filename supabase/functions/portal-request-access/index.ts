import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_REQUESTS = 3;

// Fixed, server-side-only redirect target. Never derived from the
// request's Origin header or any client-supplied value — there is no
// way to turn this into an open redirect.
const PORTAL_REDIRECT_URL = Deno.env.get('PORTAL_REDIRECT_URL') ?? 'https://bearcubz.com/portal/';

// Always this exact response, regardless of whether the email is
// invited, expired, revoked, rate-limited, or has never been heard
// of. The distinguishing logic below never reaches the response body.
const NEUTRAL_RESPONSE = { ok: true };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    // Client-side validation already catches this in the normal
    // flow — this is a defensive backstop, not where the real
    // security boundary lives, so it's fine to answer honestly here.
    return json({ error: 'INVALID_EMAIL' }, 400);
  }

  const client = createAdminClient(env.supabaseUrl, env.serviceKey);

  // Log every attempt — eligible or not — before doing anything else,
  // so rate limiting applies identically regardless of eligibility.
  // An attacker probing for valid emails sees no timing or behavioral
  // difference between "rate limited" and "processed."
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const recent = await client
    .from('portal_access_request_log')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('requested_at', since);

  await client.from('portal_access_request_log').insert({ email });

  const rateLimited = (recent.count ?? 0) >= RATE_LIMIT_MAX_REQUESTS;
  if (rateLimited) return json(NEUTRAL_RESPONSE);

  const invitation = await client
    .from('artist_invitations')
    .select('id')
    .eq('status', 'pending')
    .ilike('email', email)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  let eligible = Boolean(invitation.data);

  // Stage K1: an administrator signs in through this exact same path
  // and must never also need a pending artist invitation -- but
  // nothing about the artist invitation branch above changes, and
  // nothing here grants admin status itself (that's still decided
  // exclusively by is_portal_admin(), server-side, every time the
  // signed-in session is checked). This only decides whether THIS
  // request is eligible to receive an OTP at all, the same binary
  // decision the invitation check above already makes -- and the
  // response stays byte-identical either way, so this adds no new
  // way to distinguish "is an admin" from "has an invitation" from
  // "neither" by watching this endpoint.
  //
  // Looks up admins first (a tiny, slow-growing set), then resolves
  // each one's email by id -- not the reverse. An earlier version of
  // this paginated ALL auth.users (perPage: 1000) and filtered in
  // memory, which would have meant fetching the entire user base
  // (including every Moon Racer Passport holder) on every single
  // non-invited request -- the common case for this public,
  // enumeration-resistant endpoint. Cost here scales with the number
  // of administrators, never with total registered users.
  if (!eligible) {
    const admins = await client.from('portal_admins').select('user_id').is('revoked_at', null);
    for (const row of admins.data ?? []) {
      const { data: userData } = await client.auth.admin.getUserById(row.user_id);
      if (userData.user?.email?.toLowerCase() === email) {
        eligible = true;
        break;
      }
    }
  }

  if (!eligible) return json(NEUTRAL_RESPONSE);

  // Eligible. Make sure the auth user exists before attempting OTP —
  // signInWithOtp with shouldCreateUser:false requires it, and we're
  // not relying on this project's "allow new signups" setting either
  // way (see Stage D notes on why that assumption was removed).
  // "Already registered" from createUser is treated as success, not
  // a failure — it just means this artist already has an account
  // (e.g. a Moon Racer Passport) and nothing further is needed here.
  const created = await client.auth.admin.createUser({ email, email_confirm: true });
  const alreadyExists = created.error?.message?.toLowerCase().includes('already');
  if (created.error && !alreadyExists) {
    // Something unexpected — still return the neutral response to
    // the caller, but don't pretend an email went out.
    return json(NEUTRAL_RESPONSE);
  }

  await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: PORTAL_REDIRECT_URL },
  });
  // Any error from signInWithOtp itself is intentionally not
  // inspected further here — whatever happens, the response is the
  // same neutral shape.

  return json(NEUTRAL_RESPONSE);
});
