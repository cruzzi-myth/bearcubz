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

  // Delivery state comes from the audited send attempts (latest per
  // invitation). 'sent' means Supabase Auth accepted the message and
  // handed it to the mail provider — not that it reached an inbox.
  const sends = await adminClient
    .from('portal_admin_audit_log')
    .select('target_id, details, created_at')
    .eq('action', 'send_invitation')
    .order('created_at', { ascending: false })
    .limit(500);
  const latest = new Map<string, { status: string; failure?: string; at: string }>();
  for (const row of sends.data ?? []) {
    if (!row.target_id || latest.has(row.target_id)) continue;
    const d = (row.details ?? {}) as Record<string, unknown>;
    latest.set(row.target_id, { status: String(d.status ?? ''), failure: d.failure ? String(d.failure) : undefined, at: row.created_at });
  }

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
      delivery: latest.get(r.id) ?? null,
    })),
  });
});
