import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';
import { isValidInvitationEmail, normalizeInvitationEmail, resolveExpiryDays } from '../_shared/invitationValidation.ts';

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
  if (!isValidInvitationEmail(email)) return json({ error: 'INVALID_EMAIL' }, 400);

  const expiresInDays = resolveExpiryDays(body.expiresInDays);
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  if (body.collaborationId) {
    const collab = await adminClient
      .from('collaborations')
      .select('id')
      .eq('id', body.collaborationId)
      .maybeSingle();
    if (!collab.data) return json({ error: 'INVALID_COLLABORATION' }, 400);
  }

  // Replace any existing pending invitation for this email rather
  // than erroring on the unique-pending-per-email index — re-inviting
  // is a normal admin action, not an error case.
  await adminClient
    .from('artist_invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: 'superseded' })
    .eq('status', 'pending')
    .ilike('email', email);

  const inserted = await adminClient
    .from('artist_invitations')
    .insert({
      email,
      collaboration_id: body.collaborationId ?? null,
      expires_at: expiresAt,
      invited_by: admin.uid,
    })
    .select('id')
    .single();

  if (inserted.error) return json({ error: 'CREATE_FAILED' }, 500);

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: admin.uid,
    action: 'create_invitation',
    target_table: 'artist_invitations',
    target_id: inserted.data.id,
    details: { email, collaboration_id: body.collaborationId ?? null },
  });

  return json({ ok: true, invitationId: inserted.data.id });
});
