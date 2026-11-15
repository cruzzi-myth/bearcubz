import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';
import { isValidInvitationEmail, normalizeInvitationEmail, resolveExpiryDays } from '../_shared/invitationValidation.ts';
import { classifyEmailError, findPhase01Recipient, revisedProposalReady, sendCooldownDecision } from '../_shared/invitationPolicy.ts';

// Fixed, server-side redirect target (never taken from the request).
const PORTAL_REDIRECT_URL = Deno.env.get('PORTAL_REDIRECT_URL') ?? 'https://bearcubz.com/portal/';
// Dev/test projects only: lets disposable identities exercise this
// function. Never set on production, where only the exact Phase 01
// (email, collaboration) pairs may be mailed.
const POLICY_DISABLED = Deno.env.get('PORTAL_INVITATION_POLICY_DISABLED') === 'true';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: { email?: string; collaborationId?: string; expiresInDays?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const email = normalizeInvitationEmail(body.email);
  const collaborationId = String(body.collaborationId ?? '');
  if (!isValidInvitationEmail(email) || !collaborationId) return json({ error: 'INVALID_INPUT' }, 400);

  const db = createAdminClient(env.supabaseUrl, env.serviceKey);
  const audit = (action: string, targetId: string, details: Record<string, unknown>) =>
    db.from('portal_admin_audit_log').insert({ admin_id: admin.uid, action, target_table: 'artist_invitations', target_id: targetId, details });

  // 1. Recipient policy: exact approved pairs only.
  const recipient = findPhase01Recipient(email, collaborationId);
  if (!recipient && !POLICY_DISABLED) return json({ error: 'RECIPIENT_NOT_AUTHORIZED' }, 403);

  // 2. The collaboration must exist.
  const collab = await db.from('collaborations').select('id').eq('id', collaborationId).maybeSingle();
  if (!collab.data) return json({ error: 'INVALID_COLLABORATION' }, 400);

  // 3. Setia's revised proposal must have replaced the original and be clean + approved.
  if (recipient?.requiresRevisedProposal) {
    const assets = await db
      .from('collaboration_assets')
      .select('asset_type, is_active, upload_status, security_status, security_review_status, file_sha256')
      .eq('collaboration_id', collaborationId);
    if (assets.error || !revisedProposalReady(collaborationId, assets.data ?? [])) {
      return json({ error: 'REVISED_PROPOSAL_NOT_READY' }, 409);
    }
  }

  // 4. Redundant if this email already holds an active membership here.
  const existingUser = await findUserIdByEmail(db, email);
  if (existingUser) {
    const member = await db
      .from('collaboration_members')
      .select('status')
      .eq('collaboration_id', collaborationId)
      .eq('user_id', existingUser)
      .eq('status', 'active')
      .maybeSingle();
    if (member.data) return json({ error: 'ALREADY_MEMBER' }, 409);
  }

  // 5. Reuse the active pending invitation for this pair, else create one
  //    (superseding any other pending invite for the email, as create does).
  const nowIso = new Date().toISOString();
  const pending = await db
    .from('artist_invitations')
    .select('id, expires_at')
    .eq('status', 'pending')
    .ilike('email', email)
    .eq('collaboration_id', collaborationId)
    .gt('expires_at', nowIso)
    .maybeSingle();

  let invitationId: string | undefined = pending.data?.id;
  let created = false;
  if (!invitationId) {
    await db
      .from('artist_invitations')
      .update({ status: 'revoked', revoked_at: nowIso, revoked_reason: 'superseded' })
      .eq('status', 'pending')
      .ilike('email', email);
    const expiresAt = new Date(Date.now() + resolveExpiryDays(body.expiresInDays) * 86_400_000).toISOString();
    const inserted = await db
      .from('artist_invitations')
      .insert({ email, collaboration_id: collaborationId, expires_at: expiresAt, invited_by: admin.uid })
      .select('id')
      .single();
    if (inserted.error) return json({ error: 'CREATE_FAILED' }, 500);
    invitationId = inserted.data.id;
    created = true;
    await audit('create_invitation', invitationId!, { email, collaboration_id: collaborationId, via: 'send_invitation' });
  }

  // 6. Duplicate-send prevention from the audited attempt history.
  const lastAttempt = await db
    .from('portal_admin_audit_log')
    .select('details, created_at')
    .eq('action', 'send_invitation')
    .eq('target_id', invitationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const gate = sendCooldownDecision(
    lastAttempt.data ? { status: String((lastAttempt.data.details as Record<string, unknown>)?.status), atMs: Date.parse(lastAttempt.data.created_at) } : null,
    Date.now(),
  );
  if (gate !== 'allow') return json({ error: gate === 'in-flight' ? 'SEND_IN_PROGRESS' : 'ALREADY_SENT_RECENTLY', invitationId }, 409);

  // 7. Request delivery (audited BEFORE the call so a duplicate click is blocked).
  await audit('send_invitation', invitationId!, { status: 'requested', email, collaboration_id: collaborationId });

  const createdUser = await db.auth.admin.createUser({ email, email_confirm: true });
  const alreadyExists = createdUser.error?.message?.toLowerCase().includes('already');
  if (createdUser.error && !alreadyExists) {
    const failure = classifyEmailError(createdUser.error);
    await audit('send_invitation', invitationId!, { status: 'failed', email, failure: failure.code });
    return json({ ok: false, invitationId, created, delivery: 'failed', failure });
  }

  const sent = await db.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: PORTAL_REDIRECT_URL },
  });

  if (sent.error) {
    const failure = classifyEmailError(sent.error);
    await audit('send_invitation', invitationId!, { status: 'failed', email, failure: failure.code });
    return json({ ok: false, invitationId, created, delivery: 'failed', failure });
  }

  // Supabase Auth accepted the message and handed it to the configured
  // mail provider. That is the strongest confirmation available here;
  // inbox delivery itself is not observable, so this is reported as
  // "accepted by mail provider", never as "delivered".
  await audit('send_invitation', invitationId!, { status: 'sent', email, collaboration_id: collaborationId });
  return json({ ok: true, invitationId, created, delivery: 'sent' });
});

async function findUserIdByEmail(db: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  // Resolve by the invitation-eligible email via the profile table
  // first (cheap, indexed); fall back to no match rather than paging
  // every auth user.
  const profile = await db.from('artist_profiles').select('user_id').ilike('email', email).maybeSingle();
  return profile.data?.user_id ?? null;
}
