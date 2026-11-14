import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient, createUserClient } from '../_shared/clients.ts';

const VALID_KINDS = ['general', 'track_specific', 'revision_request'];
const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_SUBMISSIONS = 10;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'NOT_AUTHENTICATED' }, 401);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  let body: { collaborationId?: string; assetId?: string; kind?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const text = (body.body ?? '').trim();
  if (
    !body.collaborationId ||
    !body.kind ||
    !VALID_KINDS.includes(body.kind) ||
    text.length < 1 ||
    text.length > 4000
  ) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const userClient = createUserClient(env.supabaseUrl, authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'NOT_AUTHENTICATED' }, 401);
  const uid = userData.user.id;

  // Membership check via RLS, as the real user — same pattern as
  // portal-signed-url. "Not a member" and "collaboration doesn't
  // exist" are indistinguishable on purpose.
  const membership = await userClient
    .from('collaboration_members')
    .select('collaboration_id')
    .eq('collaboration_id', body.collaborationId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership.data) return json({ error: 'NOT_AUTHORIZED' }, 403);

  // Stage I3M hardening: an assetId must belong to the SAME
  // collaboration the caller is posting feedback into. Looked up via
  // the user-scoped client (RLS-enforced, same pattern as above) so
  // "asset doesn't exist," "asset belongs to a different
  // collaboration," and "asset belongs to a collaboration this caller
  // isn't a member of" are all indistinguishable from the client's
  // point of view — nothing here reveals whether an asset ID exists
  // across a collaboration boundary the caller has no access to.
  if (body.assetId) {
    const asset = await userClient
      .from('collaboration_assets')
      .select('collaboration_id')
      .eq('id', body.assetId)
      .maybeSingle();

    if (!asset.data || asset.data.collaboration_id !== body.collaborationId) {
      return json({ error: 'NOT_AUTHORIZED' }, 403);
    }
  }

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const recent = await adminClient
    .from('collaboration_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', uid)
    .gte('created_at', since);

  if ((recent.count ?? 0) >= RATE_LIMIT_MAX_SUBMISSIONS) {
    return json({ error: 'RATE_LIMITED' }, 429);
  }

  // author_id comes from the verified session, never from the
  // request body — there is no field a client could set to post as
  // someone else.
  const inserted = await adminClient
    .from('collaboration_feedback')
    .insert({
      collaboration_id: body.collaborationId,
      author_id: uid,
      asset_id: body.assetId ?? null,
      kind: body.kind,
      body: text,
      is_admin_reply: false,
    })
    .select('id')
    .single();

  if (inserted.error) return json({ error: 'SUBMIT_FAILED' }, 500);

  // Stage K1.6C: backward-compatible addition — feedbackId lets the
  // caller chain attachment uploads to this exact, real message (see
  // portal-request-attachment-upload-url). Every existing caller that
  // only reads `ok` is unaffected.
  return json({ ok: true, feedbackId: inserted.data.id });
});
