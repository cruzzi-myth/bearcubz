// Stage I3M Task 2: the one function in SIGNAL PORTAL meant to be
// reachable by a logged-out visitor. Exercises it exactly the way a
// real browser does (anon key only, via callEdgeFunction's default
// Authorization: Bearer <anonKey>), plus the platform JWT gateway's
// own rejection of a request with no Authorization header at all.
// Every identity/email this file creates on its own (not part of
// fixtures.mjs's shared set) is cleaned up at the end of run().
import { check } from '../_harness.mjs';
import { callEdgeFunction, callEdgeFunctionWithNoAuthHeader, bearerFor } from '../_functions.mjs';
import { testEmail } from '../fixtures.mjs';

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  await check('an invalid email is rejected with INVALID_EMAIL', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-request-access', { body: { email: 'not-an-email' } });
    return result.status === 400 && result.body.error === 'INVALID_EMAIL';
  });

  await check('a request with NO Authorization header is rejected at the platform gateway, before the function itself ever runs', async () => {
    const result = await callEdgeFunctionWithNoAuthHeader(supabaseUrl, anonKey, 'portal-request-access', { email: testEmail('access-flow-unreached') });
    return result.status === 401;
  });

  // --- enumeration resistance: an email that was never invited ---
  const neverInvitedEmail = testEmail('access-flow-never-invited');
  await check('a never-invited email gets the identical neutral response as an eligible one', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-request-access', { body: { email: neverInvitedEmail } });
    return result.status === 200 && result.body.ok === true;
  });
  await check('the never-invited email never got an auth user created for it (distinguishing logic never reached the response)', async () => {
    const { data } = await clients.admin.auth.admin.listUsers();
    return !data?.users?.some((u) => u.email === neverInvitedEmail);
  });

  // --- real eligible flow: admin invites an already-registered email, visitor requests access ---
  const accessEmail = testEmail('access-flow-eligible');
  const preCreated = await clients.admin.auth.admin.createUser({ email: accessEmail, email_confirm: true });
  const accessUid = preCreated.data?.user?.id;

  const invited = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-create-invitation', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { email: accessEmail },
  });
  await check('admin can create an invitation for the access-flow test email', async () => invited.status === 200 && invited.body.ok === true);

  await check('an eligible, invited email also gets the identical neutral response (OTP initiation path, same as ineligible)', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-request-access', { body: { email: accessEmail } });
    return result.status === 200 && result.body.ok === true;
  });

  await check('the eligible request was logged, same as the ineligible case', async () => {
    const { count } = await clients.admin
      .from('portal_access_request_log')
      .select('id', { count: 'exact', head: true })
      .eq('email', accessEmail);
    return (count ?? 0) >= 1;
  });

  await check('portal-request-access never consumes or alters the invitation itself -- still pending afterward', async () => {
    const { data } = await clients.admin.from('artist_invitations').select('status').eq('email', accessEmail).maybeSingle();
    return data?.status === 'pending';
  });

  // --- rate limiting: logging-before-gating means every attempt is recorded, eligible or not ---
  const rateLimitEmail = testEmail('access-flow-rate-limit');
  let allNeutral = true;
  for (let i = 0; i < 5; i++) {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-request-access', { body: { email: rateLimitEmail } });
    if (result.status !== 200 || result.body.ok !== true) allNeutral = false;
  }
  await check('5 rapid requests for the same email all return the identical neutral response, including past the 3-per-15-minute limit', async () => allNeutral);

  await check('every one of the 5 rapid requests was logged, proving logging happens before the rate-limit check gates anything', async () => {
    const { count } = await clients.admin
      .from('portal_access_request_log')
      .select('id', { count: 'exact', head: true })
      .eq('email', rateLimitEmail);
    return (count ?? 0) === 5;
  });

  // --- cleanup: this scenario's own identities/rows, not covered by fixtures.mjs teardown ---
  await clients.admin.from('portal_access_request_log').delete().in('email', [neverInvitedEmail, accessEmail, rateLimitEmail]);
  await clients.admin.from('artist_invitations').delete().eq('email', accessEmail);
  if (accessUid) await clients.admin.auth.admin.deleteUser(accessUid);
}
