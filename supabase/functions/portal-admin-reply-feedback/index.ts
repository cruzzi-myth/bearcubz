import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: { collaborationId?: string; assetId?: string; body?: string; recipientUserId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const text = (body.body ?? '').trim();
  if (!body.collaborationId || text.length < 1 || text.length > 4000) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const collab = await adminClient.from('collaborations').select('id').eq('id', body.collaborationId).maybeSingle();
  if (!collab.data) return json({ error: 'INVALID_COLLABORATION' }, 400);

  // Stage I1 hardening: an admin reply can now be scoped to one
  // specific member (recipient_user_id), closing the privacy gap a
  // multi-member collaboration would otherwise have — every active
  // member currently sees every admin reply on the collaboration.
  // If the caller doesn't specify a recipient, and the collaboration
  // has exactly one active member, default to that member explicitly
  // rather than leaving it NULL — this is strictly safer than the
  // old behavior for the single-artist case that's the only one ever
  // actually used so far, and costs nothing when there's no ambiguity
  // to resolve. With zero or more than one active member and no
  // recipient specified, it's left NULL (visible to the whole
  // collaboration, today's original behavior) rather than guessing.
  let recipientUserId: string | null = body.recipientUserId ?? null;
  if (!recipientUserId) {
    const members = await adminClient
      .from('collaboration_members')
      .select('user_id')
      .eq('collaboration_id', body.collaborationId)
      .eq('status', 'active');
    if (members.data?.length === 1) recipientUserId = members.data[0].user_id;
  }

  const inserted = await adminClient
    .from('collaboration_feedback')
    .insert({
      collaboration_id: body.collaborationId,
      author_id: admin.uid,
      asset_id: body.assetId ?? null,
      recipient_user_id: recipientUserId,
      kind: 'admin_reply',
      is_admin_reply: true,
      body: text,
    })
    .select('id')
    .single();

  if (inserted.error) return json({ error: 'REPLY_FAILED' }, 500);

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: admin.uid,
    action: 'reply_feedback',
    target_table: 'collaboration_feedback',
    target_id: body.collaborationId,
    details: { asset_id: body.assetId ?? null },
  });

  // Stage K1.6C: backward-compatible addition, same as portal-submit-feedback.
  return json({ ok: true, feedbackId: inserted.data.id });
});
