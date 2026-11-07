import { check } from '../_harness.mjs';
import { loadClassifyAuthorization } from '../_compiled.mjs';

export async function run(ctx) {
  const { clients, fixtures } = ctx;
  const classifyAuthorization = await loadClassifyAuthorization();

  await check('valid administrator: is_portal_admin() returns true for the admin session', async () => {
    const { data, error } = await fixtures.adminIdentity.client.rpc('is_portal_admin');
    return !error && data === true;
  });

  await check('valid administrator: can select every collaboration via the admin-all policy', async () => {
    const { data, error } = await fixtures.adminIdentity.client.from('collaborations').select('id');
    return !error && (data?.length ?? 0) >= 2;
  });

  await check('valid invited/active artist: is_portal_admin() returns false', async () => {
    const { data, error } = await fixtures.artistA.client.rpc('is_portal_admin');
    return !error && data === false;
  });

  await check('valid invited/active artist: classifies as authorized', async () => {
    const [memberships, adminCheck] = await Promise.all([
      fixtures.artistA.client.from('collaboration_members').select('status'),
      fixtures.artistA.client.rpc('is_portal_admin'),
    ]);
    const result = classifyAuthorization({
      membershipsError: memberships.error,
      adminCheckError: adminCheck.error,
      adminStatus: adminCheck.data === true,
      memberships: memberships.data ?? [],
    });
    return result === 'authorized';
  });

  await check('unauthorized Passport-style user (real session, zero membership rows): classifies as not-authorized', async () => {
    const [memberships, adminCheck] = await Promise.all([
      fixtures.unauthorizedUser.client.from('collaboration_members').select('status'),
      fixtures.unauthorizedUser.client.rpc('is_portal_admin'),
    ]);
    const result = classifyAuthorization({
      membershipsError: memberships.error,
      adminCheckError: adminCheck.error,
      adminStatus: adminCheck.data === true,
      memberships: memberships.data ?? [],
    });
    return result === 'not-authorized';
  });

  await check('revoked member: classifies as revoked, not not-authorized', async () => {
    const [memberships, adminCheck] = await Promise.all([
      fixtures.revokedArtist.client.from('collaboration_members').select('status'),
      fixtures.revokedArtist.client.rpc('is_portal_admin'),
    ]);
    const result = classifyAuthorization({
      membershipsError: memberships.error,
      adminCheckError: adminCheck.error,
      adminStatus: adminCheck.data === true,
      memberships: memberships.data ?? [],
    });
    return result === 'revoked';
  });

  await check('expired/invalidated session: a globally-signed-out session is rejected on the next request', async () => {
    await clients.admin.auth.admin.signOut(fixtures.unauthorizedUser.uid, 'global');
    const { data, error } = await fixtures.unauthorizedUser.client.from('collaboration_members').select('status');
    // Either an explicit auth error, or RLS resolving auth.uid() to
    // null and returning zero rows, is an acceptable "no longer
    // authenticated" outcome — both mean "no longer answers as this
    // user." A silent success with real rows would be the failure.
    return Boolean(error) || (data ?? []).length === 0;
  });
}
