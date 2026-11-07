import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';

const PASSWORD = 'Signal-Portal-Test-Fixture-1!';

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  // --- valid acceptance ---
  const inviteeEmail = testEmail('invite-valid');
  const invitee = await createAndSignInTestUser(clients, inviteeEmail, PASSWORD);
  const created = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-create-invitation', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { email: inviteeEmail, collaborationId: fixtures.collab2Id },
  });

  await check('valid acceptance: admin can create an invitation for a real email', async () => created.status === 200 && created.body.ok === true);

  await check('valid acceptance: accept_artist_invitation() succeeds for the invited, signed-in user', async () => {
    const { data, error } = await invitee.client.rpc('accept_artist_invitation');
    return !error && data?.ok === true && data?.collaboration_id === fixtures.collab2Id;
  });

  await check('valid acceptance: an active collaboration_members row now exists for that user', async () => {
    const { data } = await invitee.client.from('collaboration_members').select('status');
    return data?.some((r) => r.status === 'active');
  });

  // --- wrong recipient ---
  await check('wrong recipient: a different signed-in user has nothing pending to accept', async () => {
    const { error } = await fixtures.unauthorizedUser.client.rpc('accept_artist_invitation');
    return Boolean(error) && /NOT_ELIGIBLE/.test(error.message ?? '');
  });

  // --- replayed invitation ---
  await check('replayed invitation: accepting a second time (already accepted) fails safely, not a duplicate grant', async () => {
    const { error } = await invitee.client.rpc('accept_artist_invitation');
    return Boolean(error) && /NOT_ELIGIBLE/.test(error.message ?? '');
  });

  // --- expired invitation ---
  const expiredEmail = testEmail('invite-expired');
  const expiredUser = await createAndSignInTestUser(clients, expiredEmail, PASSWORD);
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-create-invitation', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { email: expiredEmail, collaborationId: fixtures.collab1Id },
  });
  // Test-setup-only direct update to simulate time passing — this is
  // the admin/service-role client manipulating its own test fixture,
  // not a path any real user or function exposes.
  await clients.admin.from('artist_invitations').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).ilike('email', expiredEmail);

  await check('expired invitation: accept_artist_invitation() rejects it as NOT_ELIGIBLE, not as a different error', async () => {
    const { error } = await expiredUser.client.rpc('accept_artist_invitation');
    return Boolean(error) && /NOT_ELIGIBLE/.test(error.message ?? '');
  });

  // --- revoked invitation ---
  const revokedEmail = testEmail('invite-revoked');
  const revokedUser = await createAndSignInTestUser(clients, revokedEmail, PASSWORD);
  const revokedInvite = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-create-invitation', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { email: revokedEmail, collaborationId: fixtures.collab1Id },
  });
  const revokeResult = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'revoke_invitation', invitationId: revokedInvite.body.invitationId, reason: 'integration-test' },
  });

  await check('revoked invitation: admin revoke_invitation succeeds', async () => revokeResult.status === 200 && revokeResult.body.ok === true);

  await check('revoked invitation: accept_artist_invitation() rejects it as NOT_ELIGIBLE after revocation', async () => {
    const { error } = await revokedUser.client.rpc('accept_artist_invitation');
    return Boolean(error) && /NOT_ELIGIBLE/.test(error.message ?? '');
  });

  // --- concurrent acceptance ---
  const concurrentEmail = testEmail('invite-concurrent');
  const concurrentUser = await createAndSignInTestUser(clients, concurrentEmail, PASSWORD);
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-create-invitation', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { email: concurrentEmail, collaborationId: fixtures.collab1Id },
  });

  await check('concurrent acceptance: two simultaneous accept calls never produce two membership rows', async () => {
    await Promise.allSettled([concurrentUser.client.rpc('accept_artist_invitation'), concurrentUser.client.rpc('accept_artist_invitation')]);
    const { data } = await clients.admin
      .from('collaboration_members')
      .select('user_id')
      .eq('collaboration_id', fixtures.collab1Id)
      .eq('user_id', concurrentUser.uid);
    return (data?.length ?? 0) === 1;
  });

  const deletionErrors = [];
  for (const identity of [invitee, expiredUser, revokedUser, concurrentUser]) {
    const error = await deleteTestUser(clients, identity.uid);
    if (error) deletionErrors.push({ email: identity.email, message: error.message });
  }
  await clients.admin.from('artist_invitations').delete().in('email', [inviteeEmail, expiredEmail, revokedEmail, concurrentEmail]);
  if (deletionErrors.length > 0) {
    throw new Error(`invitations.mjs cleanup: failed to delete ${deletionErrors.length} synthetic user(s): ${JSON.stringify(deletionErrors)}`);
  }
}
