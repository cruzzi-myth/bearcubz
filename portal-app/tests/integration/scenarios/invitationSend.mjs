// Invitation Phase 01 — the administrator-triggered Send Invitation
// action (portal-admin-send-invitation), against the dev project with
// disposable identities only. Real email delivery cannot be proven
// here (dev uses Supabase's shared SMTP, which only mails project team
// members), so these checks prove the parts that are provable:
// authorization, no duplicate invitations, duplicate-send prevention,
// honest delivery status (never "sent" unless the provider accepted),
// redundancy checks, and audit logging.
import { check } from '../_harness.mjs';
import { callEdgeFunction, callEdgeFunctionWithNoAuthHeader, bearerFor } from '../_functions.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';

const PASSWORD = 'Signal-Portal-Test-Fixture-1!';

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;
  const send = (identity, body) =>
    callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-send-invitation', { authHeader: identity ? bearerFor(identity) : undefined, body });
  const adminId = fixtures.adminIdentity;

  const sendEmail = testEmail('send-flow');
  const memberEmail = testEmail('send-already-member');
  const createdInvitationIds = [];
  let memberUid;

  try {
    await check('a signed-out request is rejected at the gateway', async () => {
      const r = await callEdgeFunctionWithNoAuthHeader(supabaseUrl, anonKey, 'portal-admin-send-invitation', { email: sendEmail, collaborationId: fixtures.collab2Id });
      return r.status === 401;
    });

    await check('an ordinary artist (non-admin) cannot send invitations', async () => {
      const r = await send(fixtures.artistA, { email: sendEmail, collaborationId: fixtures.collab2Id });
      return r.status === 403 && r.body.error === 'NOT_AUTHORIZED';
    });

    await check('invalid input is rejected', async () => {
      const r = await send(adminId, { email: 'nope', collaborationId: fixtures.collab2Id });
      return r.status === 400 && r.body.error === 'INVALID_INPUT';
    });

    await check('a non-existent collaboration is rejected', async () => {
      const r = await send(adminId, { email: sendEmail, collaborationId: crypto.randomUUID() });
      return r.status === 400 && r.body.error === 'INVALID_COLLABORATION';
    });

    // --- the real send attempt ---
    const first = await send(adminId, { email: sendEmail, collaborationId: fixtures.collab2Id });
    if (first.body.invitationId) createdInvitationIds.push(first.body.invitationId);

    await check('admin send creates exactly one pending invitation bound to the chosen collaboration', async () => {
      const { data } = await clients.admin.from('artist_invitations').select('id, status, collaboration_id, email').ilike('email', sendEmail);
      return data?.length === 1 && data[0].status === 'pending' && data[0].collaboration_id === fixtures.collab2Id;
    });

    await check('delivery outcome is reported honestly: ok only with delivery "sent"; otherwise an actionable failure, never a false success', async () => {
      if (first.status !== 200) return false;
      if (first.body.ok === true) return first.body.delivery === 'sent';
      return first.body.delivery === 'failed' && typeof first.body.failure?.code === 'string' && typeof first.body.failure?.message === 'string';
    });

    await check('the audit log records the request and the matching final outcome', async () => {
      const { data } = await clients.admin
        .from('portal_admin_audit_log')
        .select('details, created_at')
        .eq('action', 'send_invitation')
        .eq('target_id', first.body.invitationId)
        .order('created_at', { ascending: true });
      const statuses = (data ?? []).map((r) => r.details?.status);
      const expected = first.body.ok === true ? 'sent' : 'failed';
      return statuses[0] === 'requested' && statuses[statuses.length - 1] === expected;
    });

    await check('the Command Center listing reports the delivery state for that invitation', async () => {
      const r = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-list-invitations', { authHeader: bearerFor(adminId), body: {} });
      const inv = r.body.invitations?.find((i) => i.id === first.body.invitationId);
      return Boolean(inv) && inv.delivery?.status === (first.body.ok === true ? 'sent' : 'failed');
    });

    // --- duplicate-send prevention (deterministic: seed an audited 'sent' attempt) ---
    await clients.admin.from('portal_admin_audit_log').insert({
      admin_id: adminId.uid,
      action: 'send_invitation',
      target_table: 'artist_invitations',
      target_id: first.body.invitationId,
      details: { status: 'sent', email: sendEmail, seeded: true },
    });
    await check('a second send right after a successful one is blocked (no duplicate email)', async () => {
      const r = await send(adminId, { email: sendEmail, collaborationId: fixtures.collab2Id });
      return r.status === 409 && r.body.error === 'ALREADY_SENT_RECENTLY';
    });
    await check('a send while another is in flight is blocked', async () => {
      await clients.admin.from('portal_admin_audit_log').insert({
        admin_id: adminId.uid,
        action: 'send_invitation',
        target_table: 'artist_invitations',
        target_id: first.body.invitationId,
        details: { status: 'requested', email: sendEmail, seeded: true },
      });
      const r = await send(adminId, { email: sendEmail, collaborationId: fixtures.collab2Id });
      return r.status === 409 && r.body.error === 'SEND_IN_PROGRESS';
    });
    await check('repeat sends never create a duplicate active invitation', async () => {
      const { data } = await clients.admin.from('artist_invitations').select('id').ilike('email', sendEmail).eq('status', 'pending');
      return data?.length === 1;
    });

    // --- redundant: already an active member ---
    const member = await createAndSignInTestUser(clients, memberEmail, PASSWORD);
    memberUid = member.uid;
    await clients.admin.from('artist_profiles').upsert({ user_id: member.uid, display_name: 'send-member', email: memberEmail });
    await clients.admin.from('collaboration_members').insert({ collaboration_id: fixtures.collab2Id, user_id: member.uid, added_by: adminId.uid, status: 'active' });
    await check('inviting someone who already has active access is refused as redundant', async () => {
      const r = await send(adminId, { email: memberEmail, collaborationId: fixtures.collab2Id });
      return r.status === 409 && r.body.error === 'ALREADY_MEMBER';
    });
    await check('the refused redundant send created no invitation', async () => {
      const { data } = await clients.admin.from('artist_invitations').select('id').ilike('email', memberEmail);
      return (data?.length ?? 0) === 0;
    });
  } finally {
    if (createdInvitationIds.length) await clients.admin.from('artist_invitations').delete().in('id', createdInvitationIds);
    const { data: users } = await clients.admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users?.users ?? []) if (u.email === sendEmail) await deleteTestUser(clients, u.id);
    if (memberUid) await deleteTestUser(clients, memberUid);
  }
}
