import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';

/**
 * artist_invitations deliberately has zero RLS grants to
 * `authenticated`, even for an admin — its entire lifecycle (Stage D)
 * was built to run through service-role Edge Functions only, unlike
 * every other table here (which have an "admin select all" RLS
 * policy an admin's own session can use directly). This is the one
 * genuine exception: a read-only listing needs a function precisely
 * because that table was locked down harder than the rest, not
 * because the admin-read pattern established elsewhere failed.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);
  const { data, error } = await adminClient
    .from('artist_invitations')
    .select('id, email, collaboration_id, status, expires_at, accepted_at, revoked_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return json({ error: 'LIST_FAILED' }, 500);

  return json({
    invitations: (data ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      collaborationId: r.collaboration_id,
      status: r.status,
      expiresAt: r.expires_at,
      acceptedAt: r.accepted_at,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
    })),
  });
});
