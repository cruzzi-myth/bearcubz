// Calls a deployed Edge Function exactly the way the real frontend
// does — a plain fetch with the anon publishable key, and an
// Authorization bearer that defaults to that SAME anon key when no
// signed-in identity is given. This matches supabase-js's own
// functions.invoke(), which always attaches at least the anon key as
// the bearer even for a logged-out caller — confirmed empirically
// against the live dev deployment (Stage I2B): every deployed
// function has the platform's verify_jwt gateway check enabled, which
// rejects a request with NO Authorization header at all at the
// gateway (401 UNAUTHORIZED_NO_AUTH_HEADER) before it ever reaches the
// function's own code. An earlier version of this helper omitted
// Authorization entirely for "unauthenticated" calls, which doesn't
// match how any real client actually calls these functions and would
// have made the rls.mjs "unauthenticated caller" scenario assert
// against the wrong layer (the gateway's generic rejection, not the
// function's own requireAdmin()/NOT_AUTHORIZED check) — fixed here,
// not by relaxing verify_jwt.
export async function callEdgeFunction(supabaseUrl, anonKey, name, { authHeader, body } = {}) {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: authHeader ?? `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

/** The one deliberately-different case: a request with literally no
 * Authorization header, to exercise the platform gateway's own
 * verify_jwt rejection as its own distinct layer — never conflated
 * with the application's requireAdmin() check. */
export async function callEdgeFunctionWithNoAuthHeader(supabaseUrl, anonKey, name, body) {
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

export function bearerFor(identity) {
  return `Bearer ${identity.accessToken}`;
}
